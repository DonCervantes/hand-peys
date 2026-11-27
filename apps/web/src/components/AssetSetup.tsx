/**
 * Prepara la wallet para usar los activos on-chain:
 * 1) que la cuenta exista (XLM), 2) trustline a MXNe/USDC, 3) saldo suficiente (faucet en testnet).
 * En modo demo o sin wallet no hace nada y muestra `children`.
 */
import { useQuery } from "@tanstack/react-query";
import { Coins, ShieldCheck, Wallet as WalletIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ASSETS, type AssetCode } from "@hand-peys/shared";
import { buildChangeTrust, getAssetStatus } from "@hand-peys/stellar";
import { api } from "../lib/api";
import { money } from "../lib/format";
import { useConfig } from "../lib/session";
import { useContractTx } from "../lib/tx";
import { useWallet } from "../lib/wallet";
import { Button, ErrorNote } from "./ui";

interface Props {
  assets: AssetCode[];
  role: "merchant" | "payer";
  /** Saldo mínimo requerido (solo para quien paga). */
  need?: { asset: AssetCode; units: bigint };
  children?: ReactNode;
}

export function AssetSetup({ assets, role, need, children }: Props) {
  const wallet = useWallet();
  const { data: config } = useConfig();
  const tx = useContractTx();
  const [faucetBusy, setFaucetBusy] = useState(false);
  const [faucetError, setFaucetError] = useState<string | null>(null);
  const address = wallet.address;
  const active = Boolean(config && !config.demo && address);

  const q = useQuery({
    queryKey: ["asset-status", address, assets.join(",")],
    enabled: active,
    queryFn: async () => Object.fromEntries(await Promise.all(assets.map(async (a) => [a, await getAssetStatus(config!, address!, a)] as const))),
    refetchInterval: (query) => {
      const st = query.state.data;
      return st && Object.values(st).every((s) => s.exists) ? false : 3000;
    },
  });

  if (!active) return <>{children}</>;
  if (q.isLoading || !q.data) return <p className="text-center text-sm text-gris">Revisando tu wallet…</p>;

  const statuses = q.data;
  const box = (icon: ReactNode, title: string, body: ReactNode) => (
    <div className="space-y-3 rounded-2xl border border-linea bg-crema p-4">
      <p className="flex items-center gap-2 font-semibold">
        {icon} {title}
      </p>
      {body}
    </div>
  );

  if (Object.values(statuses).some((s) => !s.exists)) {
    if (config!.network === "mainnet")
      return box(
        <WalletIcon className="size-4 text-oro-dark" />,
        "Activa tu wallet con XLM",
        <>
          <p className="text-sm text-gris">
            Envía al menos <b className="text-tinta">3 XLM</b> a tu wallet desde tu exchange o wallet. Esto la activa en la red Stellar y cubre las comisiones de red.
          </p>
          <p className="break-all rounded-lg bg-white p-2 font-mono text-xs ring-1 ring-linea">{address}</p>
          <Button variant="secondary" className="w-full" onClick={() => void navigator.clipboard?.writeText(address!)}>
            Copiar dirección
          </Button>
          <p className="text-xs text-gris">Esta pantalla se actualiza sola cuando lleguen los XLM.</p>
        </>
      );
    return box(
      <WalletIcon className="size-4 text-oro-dark" />,
      "Activando tu wallet en la red…",
      <p className="text-sm text-gris">Esto tarda unos segundos la primera vez.</p>
    );
  }

  const missing = assets.filter((a) => !statuses[a]!.trusted);
  if (missing.length) {
    const labels = missing.map((a) => ASSETS[a].short.toLowerCase()).join(" y ");
    return box(
      <ShieldCheck className="size-4 text-oro-dark" />,
      role === "merchant" ? `Habilita ${labels} para recibir pagos` : `Habilita ${labels} en tu wallet`,
      <>
        <p className="text-sm text-gris">
          Es una sola vez: tu wallet acepta {missing.map((a) => ASSETS[a].label).join(" y ")}. Cuesta una fracción de centavo.
        </p>
        <Button
          className="w-full"
          loading={tx.pending}
          onClick={async () => {
            const hash = await tx.run((d) => buildChangeTrust(d, address!, missing));
            if (hash) await q.refetch();
          }}
        >
          Habilitar {labels}
        </Button>
        <ErrorNote>{tx.error}</ErrorNote>
      </>
    );
  }

  if (need && statuses[need.asset]!.balance < need.units) {
    const testnet = config!.network === "testnet";
    return box(
      <Coins className="size-4 text-oro-dark" />,
      "No tienes saldo suficiente",
      <>
        <p className="text-sm text-gris">
          Tienes {money(statuses[need.asset]!.balance.toString(), need.asset)} y el cobro es de {money(need.units.toString(), need.asset)}.
        </p>
        {testnet && (
          <Button
            className="w-full"
            loading={faucetBusy}
            onClick={async () => {
              setFaucetBusy(true);
              setFaucetError(null);
              try {
                await api("/faucet", { body: { wallet: address, asset: need.asset } });
                await q.refetch();
              } catch (e) {
                setFaucetError((e as Error).message);
              } finally {
                setFaucetBusy(false);
              }
            }}
          >
            Obtener {ASSETS[need.asset].short.toLowerCase()} de prueba (testnet)
          </Button>
        )}
        <ErrorNote>{faucetError}</ErrorNote>
      </>
    );
  }

  return <>{children}</>;
}

/** Para el dueño del comercio: habilita los activos de esta red que requieren trustline (XLM no la necesita). */
export function ReceiveSetup({ merchantWallet }: { merchantWallet: string }) {
  const wallet = useWallet();
  const { data: config } = useConfig();
  const available = (Object.keys(config?.tokens ?? {}) as AssetCode[]).filter((a) => config?.tokens[a]?.contractId);
  const withTrust = available.filter((a) => a !== "XLM");
  // Sin trustlines (XLM) igual verificamos que la wallet exista en la red.
  const assets = withTrust.length ? withTrust : available.slice(0, 1);
  if (wallet.address !== merchantWallet || !assets.length) return null;
  return (
    <div className="mb-4 empty:hidden">
      <AssetSetup role="merchant" assets={assets} />
    </div>
  );
}

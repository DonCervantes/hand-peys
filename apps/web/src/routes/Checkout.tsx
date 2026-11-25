import { useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { ASSETS } from "@hand-peys/shared";
import { buildEscrow, buildPay, type EscrowAction } from "@hand-peys/stellar";
import { Logo } from "../components/Layout";
import { Button, Card, ErrorNote, Spinner } from "../components/ui";
import { api, type PublicLink } from "../lib/api";
import { fecha, money, PAYMENT_STATUS } from "../lib/format";
import { useContractTx } from "../lib/tx";
import { useWallet } from "../lib/wallet";

export function Checkout() {
  const { id } = useParams({ strict: false }) as { id: string };
  const wallet = useWallet();
  const pay = useContractTx("payment_link");
  const escrow = useContractTx("escrow");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["public", id],
    queryFn: () => api<PublicLink>(`/p/${id}`),
    refetchInterval: (query) => (query.state.data?.status === "paid" && query.state.data.payment?.status !== "held" ? false : 4000),
  });

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data)
    return (
      <Shell>
        <Card className="text-center">
          <p className="text-lg font-semibold">Este link no existe o ya no está disponible.</p>
        </Card>
      </Shell>
    );
  const l = q.data;

  async function doPay() {
    setBusy(true);
    setError(null);
    try {
      if (l.chain.demo) {
        await api(`/p/${id}/demo-pay`, { body: { payer: wallet.address } });
      } else {
        const hash = await pay.run((d) => buildPay(d, { id, payer: wallet.address! }));
        if (!hash) return;
        await api(`/p/${id}/sync`, { method: "POST" }).catch(() => {});
      }
      await q.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function escrowAct(action: EscrowAction) {
    const hash = await escrow.run((d) => buildEscrow(d, action, { id, signer: wallet.address! }));
    if (hash) {
      await api(`/p/${id}/sync`, { method: "POST" }).catch(() => {});
      await q.refetch();
    }
  }

  const isPayer = l.payment && wallet.address === l.payment.payer;

  return (
    <Shell>
      <Card className="p-7">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">{l.merchant.name}</p>
            {l.merchant.city && <p className="text-xs text-gris">{l.merchant.city}</p>}
          </div>
          {l.merchant.verified && (
            <span className="flex items-center gap-1 rounded-full bg-nopal-soft px-2.5 py-1 text-xs font-semibold text-nopal">
              <ShieldCheck className="size-3.5" /> Verificado
            </span>
          )}
        </div>
        <p className="mt-6 text-sm text-gris">{l.description}</p>
        <p className="font-display text-5xl font-extrabold">{money(l.amountUnits, l.asset)}</p>
        <p className="mt-1 text-xs text-gris">en {ASSETS[l.asset].label.toLowerCase()}</p>
        {l.mode === "escrow" && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-crema p-3 text-sm">
            <Lock className="mt-0.5 size-4 shrink-0 text-rosa" />
            Pago con garantía: tu dinero queda apartado hasta que confirmes que recibiste tu pedido.
          </p>
        )}

        <div className="mt-6 space-y-3">
          {l.status === "paid" && l.payment ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-2xl bg-nopal-soft p-4 text-nopal">
                <CheckCircle2 className="size-8" />
                <div>
                  <p className="font-bold">¡Pago {l.payment.status === "held" ? "apartado" : "completado"}!</p>
                  <p className="text-xs">
                    {fecha(l.payment.createdAt)} · {PAYMENT_STATUS[l.payment.status]?.label}
                  </p>
                </div>
              </div>
              {isPayer && l.payment.status === "held" && !l.chain.demo && (
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => escrowAct("confirm")} loading={escrow.pending}>
                    Ya lo recibí
                  </Button>
                  <Button variant="danger" onClick={() => escrowAct("dispute")} loading={escrow.pending}>
                    Tengo un problema
                  </Button>
                </div>
              )}
              <ErrorNote>{escrow.error}</ErrorNote>
              <a href={`/api/p/${id}/receipt`} target="_blank" rel="noreferrer" className="block text-center text-sm font-semibold text-rosa underline">
                Descargar comprobante
              </a>
              {!l.chain.demo && (
                <a href={l.payment.explorerUrl} target="_blank" rel="noreferrer" className="block text-center text-xs text-gris underline">
                  Ver la transacción pública
                </a>
              )}
            </div>
          ) : l.status === "open" ? (
            wallet.address ? (
              <>
                <Button size="lg" className="w-full" onClick={doPay} loading={busy || pay.pending}>
                  Pagar {money(l.amountUnits, l.asset)}
                </Button>
                <p className="text-center text-xs text-gris">
                  Pagando desde tu wallet {wallet.kind === "pollar" ? "Pollar" : "de prueba"}. Comisión de red: menos de un centavo.
                </p>
              </>
            ) : (
              <Button size="lg" className="w-full" onClick={() => wallet.connect()}>
                Pagar con Google o correo
              </Button>
            )
          ) : (
            <p className="flex items-center justify-center gap-2 rounded-xl bg-black/5 p-4 text-gris">
              <Clock className="size-4" /> Este link {l.status === "expired" ? "ya venció" : "ya no está activo"}.
            </p>
          )}
          <ErrorNote>{error ?? pay.error}</ErrorNote>
        </div>
      </Card>
      <p className="mt-6 text-center text-xs text-gris">
        Pagos seguros con Hand Peys · {l.chain.demo ? "modo demo" : `red Stellar ${l.chain.network}`}
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        {children}
      </div>
    </div>
  );
}

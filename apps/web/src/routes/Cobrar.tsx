import { useNavigate, useParams } from "@tanstack/react-router";
import { ReceiveSetup } from "../components/AssetSetup";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Lock, MessageCircle, Printer, Zap } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState, type FormEvent } from "react";
import { computeFee, toUnits } from "@hand-peys/shared";
import { buildCancel, buildCreateLink } from "@hand-peys/stellar";
import { RequireMerchant } from "../components/Guard";
import { Page } from "../components/Layout";
import { Badge, Button, Card, ErrorNote, Field, Input, Select, Spinner } from "../components/ui";
import { api, type AssetCode, type LinkRow, type Merchant, type PublicLink } from "../lib/api";
import { cn, LINK_STATUS, money } from "../lib/format";
import { useConfig } from "../lib/session";
import { useContractTx } from "../lib/tx";

function NewLinkForm({ merchant }: { merchant: Merchant }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const tx = useContractTx("payment_link");
  const [amount, setAmount] = useState("");
  const { data: config } = useConfig();
  // Activos disponibles en esta red (testnet: MXNe/USDC; mainnet: XLM). En modo demo, los de testnet.
  const available = (Object.keys(config?.tokens ?? {}) as AssetCode[]).filter((a) => config?.tokens[a]?.contractId || config?.demo);
  const choices: AssetCode[] = available.length ? available : ["MXNE", "USDC"];
  const [picked, setAsset] = useState<AssetCode | null>(null);
  const asset: AssetCode = picked && choices.includes(picked) ? picked : choices[0]!;
  const [mode, setMode] = useState<"direct" | "escrow">("direct");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  let fee = "";
  try {
    if (amount) fee = money(computeFee(toUnits(amount), 90), asset);
  } catch {
    /* monto incompleto */
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ id: string; chain: null | { merchant: string; id: string; asset: AssetCode; amount: string; mode: "direct" | "escrow"; expiresAt: number } }>(
        `/merchants/${merchant.id}/links`,
        { body: { amount, asset, mode, description: f.get("description"), expiresInHours: Number(f.get("expires")) } }
      );
      // Con contratos desplegados, el dueño firma create_link (el KYC se vuelve a validar on-chain).
      if (res.chain && merchant.role === "comercio_owner") {
        const c = res.chain;
        const hash = await tx.run((d) => buildCreateLink(d, { merchant: c.merchant, id: c.id, asset: c.asset, amount: BigInt(c.amount), mode: c.mode, expiresAt: c.expiresAt }));
        if (hash) await api(`/merchants/${merchant.id}/links/${res.id}/submitted`, { body: { txHash: hash } });
      }
      await qc.invalidateQueries({ queryKey: ["links", merchant.id] });
      navigate({ to: "/app/links/$id", params: { id: res.id } });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label className="text-sm font-medium" htmlFor="amount">
          ¿Cuánto vas a cobrar?
        </label>
        <div className="mt-2 flex items-center gap-2 rounded-2xl border border-linea bg-white px-4 focus-within:border-tinta">
          <span className="font-display text-4xl font-extrabold text-gris">$</span>
          <input
            id="amount"
            inputMode="decimal"
            required
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="350"
            className="h-20 w-full bg-transparent font-display text-5xl font-extrabold outline-none"
          />
          <Select value={asset} onChange={(e) => setAsset(e.target.value as AssetCode)} className="w-28 border-0 font-semibold" aria-label="Moneda">
            {choices.map((a) => (
              <option key={a} value={a}>
                {{ MXNE: "MXN", USDC: "USD", XLM: "XLM" }[a]}
              </option>
            ))}
          </Select>
        </div>
        {fee && <p className="mt-1 text-xs text-gris">Comisión Hand Peys (0.9%): {fee}</p>}
      </div>
      <Field label="¿Por qué es el cobro?">
        <Input name="description" required maxLength={140} placeholder="10 tamales verdes" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {(
          [
            ["direct", Zap, "Directo", "Te llega al instante"],
            ["escrow", Lock, "Con garantía", "Se libera cuando el cliente confirma"],
          ] as const
        ).map(([v, Icon, t, d]) => (
          <button
            type="button"
            key={v}
            onClick={() => setMode(v)}
            className={cn("rounded-2xl border p-4 text-left transition", mode === v ? "border-tinta bg-oro-soft" : "border-linea bg-white")}
          >
            <Icon className={cn("size-5", mode === v ? "text-oro-dark" : "text-gris")} />
            <p className="mt-2 font-semibold">{t}</p>
            <p className="text-xs text-gris">{d}</p>
          </button>
        ))}
      </div>
      <Field label="Vigencia">
        <Select name="expires" defaultValue="0">
          <option value="0">Sin vencimiento</option>
          <option value="1">1 hora</option>
          <option value="24">24 horas</option>
          <option value="168">7 días</option>
        </Select>
      </Field>
      <ErrorNote>{error ?? tx.error}</ErrorNote>
      <Button type="submit" size="lg" className="w-full" loading={busy || tx.pending}>
        Crear link de cobro
      </Button>
    </form>
  );
}

export function NewLink() {
  return (
    <RequireMerchant>
      {(m) => (
        <Page>
          <div className="mx-auto max-w-lg">
            <h1 className="mb-6 text-3xl font-extrabold">Nuevo cobro</h1>
            <ReceiveSetup merchantWallet={m.wallet} />
            <Card className="p-6">
              <NewLinkForm merchant={m} />
            </Card>
          </div>
        </Page>
      )}
    </RequireMerchant>
  );
}

function LinkDetailInner({ merchant, id }: { merchant: Merchant; id: string }) {
  const qc = useQueryClient();
  const tx = useContractTx("payment_link");
  const config = useConfig();
  const [copied, setCopied] = useState(false);
  const links = useQuery({ queryKey: ["links", merchant.id], queryFn: () => api<LinkRow[]>(`/merchants/${merchant.id}/links`), refetchInterval: 5000 });
  const link = links.data?.find((l) => l.id === id);
  const pub = useQuery({
    queryKey: ["public", id],
    queryFn: () => api<PublicLink>(`/p/${id}`),
    enabled: Boolean(link && link.status !== "pending"),
    refetchInterval: 4000,
  });
  if (links.isLoading) return <Spinner />;
  if (!link) return <Page><Card>No encontramos ese link.</Card></Page>;

  const url = `${location.origin}/p/${id}`;
  const text = `Hola, aquí está tu link de pago de ${merchant.name} por ${money(link.amountUnits, link.asset)} (${link.description}): ${url}`;
  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  async function cancel() {
    const hash = await tx.run((d) => buildCancel(d, { id, merchant: merchant.wallet }));
    if (hash) await qc.invalidateQueries({ queryKey: ["links", merchant.id] });
  }

  return (
    <Page>
      <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
        <Card className="flex flex-col items-center p-8 text-center print:border-0">
          <p className="text-sm text-gris">{merchant.name}</p>
          <p className="mt-1 font-display text-5xl font-extrabold">{money(link.amountUnits, link.asset)}</p>
          <p className="mt-1 text-gris">{link.description}</p>
          <div className="my-6 rounded-2xl bg-white p-3 ring-1 ring-linea">
            <QRCodeSVG value={url} size={220} fgColor="#1d1a24" level="M" />
          </div>
          <Badge tone={LINK_STATUS[link.status]?.tone}>{LINK_STATUS[link.status]?.label}</Badge>
          {link.mode === "escrow" && <p className="mt-2 flex items-center gap-1 text-xs text-gris"><Lock className="size-3" /> Con garantía</p>}
        </Card>
        <div className="space-y-4 print:hidden">
          <h1 className="text-3xl font-extrabold">{link.status === "paid" ? "¡Te pagaron! 🎉" : "Comparte tu link"}</h1>
          {link.status === "pending" && (
            <p className="rounded-xl bg-maiz/20 p-3 text-sm text-amber-900">
              Falta que el dueño confirme este link con su wallet desde el inicio. Mientras tanto no se puede pagar.
            </p>
          )}
          {pub.data?.payment && (
            <Card className="bg-nopal-soft border-nopal-soft">
              <p className="font-semibold text-nopal">Pago recibido</p>
              <a href={pub.data.payment.explorerUrl} target="_blank" rel="noreferrer" className="text-xs text-nopal underline">
                Ver transacción
              </a>
            </Card>
          )}
          <div className="flex items-center gap-2 rounded-xl border border-linea bg-white p-2 pl-3">
            <span className="truncate text-sm">{url}</span>
            <Button variant="secondary" onClick={copy} className="ml-auto shrink-0">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noreferrer"
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#25D366] font-semibold text-white"
          >
            <MessageCircle className="size-5" /> Mandar por WhatsApp
          </a>
          <Button variant="secondary" className="w-full" onClick={() => print()}>
            <Printer className="size-4" /> Imprimir QR
          </Button>
          {link.status === "open" && merchant.role === "comercio_owner" && !config.data?.demo && (
            <Button variant="danger" className="w-full" onClick={cancel} loading={tx.pending}>
              Cancelar link
            </Button>
          )}
          <ErrorNote>{tx.error}</ErrorNote>
        </div>
      </div>
    </Page>
  );
}

export function LinkDetail() {
  const { id } = useParams({ strict: false }) as { id: string };
  return <RequireMerchant>{(m) => <LinkDetailInner merchant={m} id={id} />}</RequireMerchant>;
}

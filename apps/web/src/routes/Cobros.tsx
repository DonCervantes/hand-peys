import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Trash2, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { buildEscrow, type EscrowAction } from "@hand-peys/stellar";
import { RequireMerchant } from "../components/Guard";
import { Page } from "../components/Layout";
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Spinner } from "../components/ui";
import { api, type Merchant, type PaymentRow } from "../lib/api";
import { fecha, money, PAYMENT_STATUS, shortAddr } from "../lib/format";
import { useConfig } from "../lib/session";
import { useContractTx } from "../lib/tx";

function EscrowActions({ merchant, p }: { merchant: Merchant; p: PaymentRow }) {
  const qc = useQueryClient();
  const tx = useContractTx("escrow");
  const config = useConfig();
  if (merchant.role !== "comercio_owner" || config.data?.demo) return null;
  const act = async (action: EscrowAction) => {
    const hash = await tx.run((d) => buildEscrow(d, action, { id: p.linkId, signer: merchant.wallet }));
    if (hash) setTimeout(() => qc.invalidateQueries({ queryKey: ["payments", merchant.id] }), 8000);
  };
  return (
    <div className="mt-2 flex flex-wrap justify-end gap-2">
      {p.status === "held" && (
        <Button variant="secondary" onClick={() => act("claim")} loading={tx.pending}>
          Reclamar
        </Button>
      )}
      {(p.status === "held" || p.status === "disputed") && (
        <Button variant="danger" onClick={() => act("refund")} loading={tx.pending}>
          Reembolsar
        </Button>
      )}
      {tx.error && <p className="w-full text-right text-xs text-red-700">{tx.error}</p>}
    </div>
  );
}

function PaymentsInner({ merchant }: { merchant: Merchant }) {
  const payments = useQuery({ queryKey: ["payments", merchant.id], queryFn: () => api<PaymentRow[]>(`/merchants/${merchant.id}/payments`), refetchInterval: 10_000 });
  const config = useConfig();
  if (payments.isLoading) return <Spinner />;
  return (
    <Page title={merchant.role === "comercio_cajero" ? "Cobros de hoy" : "Cobros"}>
      <ErrorNote>{payments.error?.message}</ErrorNote>
      {!payments.data?.length ? (
        <Empty title="Aún no hay cobros" />
      ) : (
        <Card className="divide-y divide-linea p-0">
          {payments.data.map((p) => (
            <div key={p.linkId} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="font-semibold">{p.description}</p>
                <p className="text-xs text-gris">
                  {fecha(p.createdAt)} · de {shortAddr(p.payer)} · {p.mode === "escrow" ? "Con garantía" : "Directo"}
                </p>
                <div className="mt-1 flex gap-3 text-xs">
                  <a href={`/api/p/${p.linkId}/receipt`} target="_blank" rel="noreferrer" className="text-oro-dark underline">
                    Comprobante
                  </a>
                  {config.data && !config.data.demo && (
                    <a href={`${config.data.explorer}/tx/${p.txHash}`} target="_blank" rel="noreferrer" className="text-gris underline">
                      Transacción
                    </a>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="font-display text-xl font-extrabold">{money(p.amountUnits, p.asset)}</p>
                <p className="text-xs text-gris">comisión {money(p.feeUnits, p.asset)}</p>
                <Badge tone={PAYMENT_STATUS[p.status]?.tone}>{PAYMENT_STATUS[p.status]?.label}</Badge>
                <EscrowActions merchant={merchant} p={p} />
              </div>
            </div>
          ))}
        </Card>
      )}
    </Page>
  );
}

export function Payments() {
  return <RequireMerchant>{(m) => <PaymentsInner merchant={m} />}</RequireMerchant>;
}

// ---------------- Equipo ----------------
interface Members {
  members: { userId: string; email: string | null; wallet: string | null; role: string }[];
  invites: { id: string; email: string; url: string }[];
}

function TeamInner({ merchant }: { merchant: Merchant }) {
  const qc = useQueryClient();
  const data = useQuery({ queryKey: ["members", merchant.id], queryFn: () => api<Members>(`/merchants/${merchant.id}/members`) });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    try {
      await api(`/merchants/${merchant.id}/members`, { body: { email: new FormData(form).get("email"), role: "comercio_cajero" } });
      form.reset();
      await qc.invalidateQueries({ queryKey: ["members", merchant.id] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(userId: string) {
    await api(`/merchants/${merchant.id}/members/${userId}`, { method: "DELETE" });
    await qc.invalidateQueries({ queryKey: ["members", merchant.id] });
  }
  return (
    <Page title="Tu equipo">
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card className="divide-y divide-linea p-0">
          {data.data?.members.map((m) => (
            <div key={m.userId} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="font-medium">{m.email ?? shortAddr(m.wallet)}</p>
                <p className="text-xs text-gris">{m.role === "comercio_owner" ? "Dueño" : "Cajero · crea cobros y ve los del día"}</p>
              </div>
              {m.role === "comercio_cajero" && (
                <Button variant="ghost" onClick={() => remove(m.userId)} aria-label="Quitar">
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          ))}
          {data.data?.invites.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="font-medium">{i.email}</p>
                <p className="text-xs text-gris">Invitación pendiente: mándale este link</p>
              </div>
              <Button variant="secondary" onClick={() => navigator.clipboard.writeText(i.url)}>
                <Copy className="size-4" /> Copiar link
              </Button>
            </div>
          ))}
        </Card>
        <Card>
          <form onSubmit={invite} className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <UserPlus className="size-5 text-oro-dark" /> Invitar cajero
            </h2>
            <Field label="Correo" hint="Le generamos un link de invitación de un solo uso para que entre con su cuenta.">
              <Input type="email" name="email" required placeholder="cajero@correo.com" />
            </Field>
            <ErrorNote>{error}</ErrorNote>
            <Button type="submit" loading={busy} className="w-full">
              Crear invitación
            </Button>
          </form>
        </Card>
      </div>
    </Page>
  );
}

export function Team() {
  return <RequireMerchant ownerOnly>{(m) => <TeamInner merchant={m} />}</RequireMerchant>;
}

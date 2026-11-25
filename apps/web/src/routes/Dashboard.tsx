import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Lock, Plus, ShieldCheck, Users } from "lucide-react";
import { buildCreateLink } from "@hand-peys/stellar";
import { RequireMerchant } from "../components/Guard";
import { Page } from "../components/Layout";
import { Badge, Button, Card, Empty, ErrorNote, Spinner } from "../components/ui";
import { api, type LinkRow, type Merchant, type PaymentRow } from "../lib/api";
import { fecha, LINK_STATUS, money, PAYMENT_STATUS } from "../lib/format";
import { useContractTx } from "../lib/tx";

interface Summary {
  totals: { asset: "MXNE" | "USDC"; count: number; gross: string; fees: string }[];
  held: { asset: "MXNE" | "USDC"; amount: string }[];
  activeLinks: number;
  scope: "today" | "all";
}

/** El dueño firma create_link de los links que dejó pendientes un cajero (o que no alcanzó a firmar). */
function ConfirmPending({ merchant, link }: { merchant: Merchant; link: LinkRow }) {
  const qc = useQueryClient();
  const tx = useContractTx("payment_link");
  if (merchant.role !== "comercio_owner") return <Badge tone="warn">Esperando al dueño</Badge>;
  async function confirm() {
    const hash = await tx.run((d) =>
      buildCreateLink(d, { merchant: merchant.wallet, id: link.id, asset: link.asset, amount: BigInt(link.amountUnits), mode: link.mode, expiresAt: link.expiresAt })
    );
    if (hash) {
      await api(`/merchants/${merchant.id}/links/${link.id}/submitted`, { body: { txHash: hash } });
      await qc.invalidateQueries({ queryKey: ["links", merchant.id] });
    }
  }
  return (
    <span className="flex flex-col items-end gap-1">
      <Button variant="secondary" loading={tx.pending} onClick={confirm}>
        Confirmar
      </Button>
      {tx.error && <span className="text-xs text-red-700">{tx.error}</span>}
    </span>
  );
}

function DashboardInner({ merchant }: { merchant: Merchant }) {
  const summary = useQuery({ queryKey: ["summary", merchant.id], queryFn: () => api<Summary>(`/merchants/${merchant.id}`), refetchInterval: 10_000 });
  const links = useQuery({ queryKey: ["links", merchant.id], queryFn: () => api<LinkRow[]>(`/merchants/${merchant.id}/links`), refetchInterval: 10_000 });
  const payments = useQuery({ queryKey: ["payments", merchant.id], queryFn: () => api<PaymentRow[]>(`/merchants/${merchant.id}/payments`), refetchInterval: 10_000 });
  const owner = merchant.role === "comercio_owner";

  if (summary.isLoading) return <Spinner />;
  const mxne = summary.data?.totals.find((t) => t.asset === "MXNE");
  const usdc = summary.data?.totals.find((t) => t.asset === "USDC");
  const heldMx = summary.data?.held.find((h) => h.asset === "MXNE");

  return (
    <Page
      title={merchant.name}
      actions={
        <div className="flex gap-2">
          {owner && (
            <Link to="/app/equipo" className="inline-flex h-10 items-center gap-2 rounded-xl border border-linea bg-white px-4 text-sm font-semibold">
              <Users className="size-4" /> Equipo
            </Link>
          )}
          <Link to="/app/cobrar" className="inline-flex h-10 items-center gap-2 rounded-xl bg-rosa px-4 text-sm font-semibold text-white">
            <Plus className="size-4" /> Nuevo cobro
          </Link>
        </div>
      }
    >
      <ErrorNote>{summary.error?.message}</ErrorNote>
      <div className="mb-2 flex items-center gap-2 text-sm text-nopal">
        <ShieldCheck className="size-4" /> Comercio verificado {merchant.kycLevel === 2 ? "(nivel completo)" : "(nivel básico)"}
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="md:col-span-2 bg-tinta text-crema border-tinta">
          <p className="text-sm text-crema/70">{summary.data?.scope === "today" ? "Cobrado hoy" : "Cobrado (neto)"}</p>
          <p className="mt-1 font-display text-4xl font-extrabold">
            {money(BigInt(mxne?.gross ?? 0) - BigInt(mxne?.fees ?? 0), "MXNE")}
          </p>
          {usdc && <p className="mt-1 text-crema/80">+ {money(BigInt(usdc.gross) - BigInt(usdc.fees), "USDC")}</p>}
          <p className="mt-2 text-xs text-crema/60">{(mxne?.count ?? 0) + (usdc?.count ?? 0)} cobros · comisión {money(mxne?.fees ?? "0")}</p>
        </Card>
        <Card>
          <p className="flex items-center gap-1 text-sm text-gris">
            <Lock className="size-3.5" /> En garantía
          </p>
          <p className="mt-1 text-2xl font-bold">{money(heldMx?.amount ?? "0")}</p>
        </Card>
        <Card>
          <p className="text-sm text-gris">Links activos</p>
          <p className="mt-1 text-2xl font-bold">{summary.data?.activeLinks ?? 0}</p>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-bold">Últimos cobros</h2>
            <Link to="/app/cobros" className="flex items-center gap-1 text-sm font-semibold text-rosa">
              Ver todos <ArrowRight className="size-4" />
            </Link>
          </div>
          {!payments.data?.length ? (
            <Empty title="Todavía no te pagan">Crea tu primer cobro y compártelo por WhatsApp.</Empty>
          ) : (
            <Card className="divide-y divide-linea p-0">
              {payments.data.slice(0, 6).map((p) => (
                <div key={p.linkId} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.description}</p>
                    <p className="text-xs text-gris">{fecha(p.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{money(p.amountUnits, p.asset)}</p>
                    <Badge tone={PAYMENT_STATUS[p.status]?.tone}>{PAYMENT_STATUS[p.status]?.label}</Badge>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-xl font-bold">Links</h2>
          {!links.data?.length ? (
            <Empty title="Sin links todavía" />
          ) : (
            <Card className="divide-y divide-linea p-0">
              {links.data.slice(0, 8).map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <Link to="/app/links/$id" params={{ id: l.id }} className="min-w-0 hover:underline">
                    <p className="truncate font-medium">{l.description}</p>
                    <p className="text-xs text-gris">
                      {money(l.amountUnits, l.asset)} · {l.mode === "escrow" ? "Con garantía" : "Directo"}
                    </p>
                  </Link>
                  {l.status === "pending" ? (
                    <ConfirmPending merchant={merchant} link={l} />
                  ) : (
                    <Badge tone={LINK_STATUS[l.status]?.tone}>{LINK_STATUS[l.status]?.label}</Badge>
                  )}
                </div>
              ))}
            </Card>
          )}
        </section>
      </div>
    </Page>
  );
}

export function Dashboard() {
  return <RequireMerchant>{(m) => <DashboardInner merchant={m} />}</RequireMerchant>;
}

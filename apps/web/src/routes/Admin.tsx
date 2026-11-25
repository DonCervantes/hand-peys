import { useParams } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { nativeToScVal } from "@stellar/stellar-sdk";
import { buildInvoke, buildResolve } from "@hand-peys/stellar";
import { RequireLogin } from "../components/Guard";
import { Page } from "../components/Layout";
import { Badge, Button, Card, Empty, ErrorNote, Input, Select, Spinner } from "../components/ui";
import { api, type Me, type Merchant, type PaymentRow } from "../lib/api";
import { fecha, money, shortAddr } from "../lib/format";
import { useContractTx } from "../lib/tx";
import { useWallet } from "../lib/wallet";

const KYC_TONE = { approved: "ok", pending: "warn", none: "muted", rejected: "bad", suspended: "bad" } as const;

function RequirePlatform({ roles, children }: { roles: string[]; children: (me: Me) => React.ReactNode }) {
  return (
    <RequireLogin>
      {(me) =>
        me.user.platformRole && roles.includes(me.user.platformRole) ? (
          children(me)
        ) : (
          <Page>
            <Card>No tienes acceso a esta sección.</Card>
          </Page>
        )
      }
    </RequireLogin>
  );
}

function KycQueue() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [error, setError] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["admin-kyc", status], queryFn: () => api<Merchant[]>(`/admin/kyc${status ? `?status=${status}` : ""}`) });
  async function decide(m: Merchant, decision: "approve" | "reject" | "suspend", level: 1 | 2 = 1) {
    setError(null);
    const reason = decision === "approve" ? undefined : prompt("Motivo (se guarda en el historial):") ?? undefined;
    try {
      await api(`/admin/kyc/${m.id}`, { body: { decision, level, reason } });
      await qc.invalidateQueries({ queryKey: ["admin-kyc"] });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Comercios</h2>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
          <option value="pending">Pendientes</option>
          <option value="approved">Aprobados</option>
          <option value="suspended">Suspendidos</option>
          <option value="rejected">Rechazados</option>
          <option value="">Todos</option>
        </Select>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {list.isLoading ? (
        <Spinner />
      ) : !list.data?.length ? (
        <Empty title="Nada por revisar" />
      ) : (
        <Card className="divide-y divide-linea p-0">
          {list.data.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="font-semibold">
                  {m.name} <Badge tone={KYC_TONE[m.kycStatus]}>{m.kycStatus}</Badge>
                </p>
                <p className="text-xs text-gris">
                  {m.category} · {m.city ?? "—"} · {shortAddr(m.wallet)} · nivel {m.kycLevel}
                </p>
              </div>
              <div className="flex gap-2">
                {m.kycStatus !== "approved" && (
                  <>
                    <Button variant="secondary" onClick={() => decide(m, "approve", 1)}>Aprobar N1</Button>
                    <Button variant="secondary" onClick={() => decide(m, "approve", 2)}>Aprobar N2</Button>
                  </>
                )}
                {m.kycStatus === "approved" ? (
                  <Button variant="danger" onClick={() => decide(m, "suspend")}>Suspender</Button>
                ) : (
                  m.kycStatus !== "rejected" && <Button variant="danger" onClick={() => decide(m, "reject")}>Rechazar</Button>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}

function Disputes() {
  const wallet = useWallet();
  const tx = useContractTx("escrow");
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-disputes"], queryFn: () => api<(PaymentRow & { merchant: string })[]>("/admin/disputes") });
  async function resolve(p: PaymentRow, toMerchant: boolean) {
    const hash = await tx.run((d) => buildResolve(d, { id: p.linkId, signer: wallet.address!, toMerchant }));
    if (hash) {
      await api(`/p/${p.linkId}/sync`, { method: "POST" }).catch(() => {});
      await qc.invalidateQueries({ queryKey: ["admin-disputes"] });
    }
  }
  return (
    <section>
      <h2 className="mb-3 text-xl font-bold">Disputas de garantía</h2>
      <ErrorNote>{tx.error}</ErrorNote>
      {!list.data?.length ? (
        <Empty title="Sin disputas abiertas" />
      ) : (
        <Card className="divide-y divide-linea p-0">
          {list.data.map((p) => (
            <div key={p.linkId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="font-semibold">
                  {p.description} · {money(p.amountUnits, p.asset)}
                </p>
                <p className="text-xs text-gris">
                  {p.merchant} · cliente {shortAddr(p.payer)} · {fecha(p.createdAt)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" loading={tx.pending} onClick={() => resolve(p, true)}>A favor del comercio</Button>
                <Button variant="secondary" loading={tx.pending} onClick={() => resolve(p, false)}>Reembolsar cliente</Button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}

export function Compliance() {
  return (
    <RequirePlatform roles={["cumplimiento", "super_admin"]}>
      {() => (
        <Page title="Cumplimiento">
          <div className="space-y-10">
            <KycQueue />
            <Disputes />
          </div>
        </Page>
      )}
    </RequirePlatform>
  );
}

interface Metrics {
  merchants: { total: number; verified: number };
  links: { total: number; open: number };
  volume: { asset: "MXNE" | "USDC"; count: number; gross: string; fees: string }[];
  feeBps: number;
}

export function SuperAdmin() {
  return <RequirePlatform roles={["super_admin"]}>{() => <SuperAdminInner />}</RequirePlatform>;
}

function SuperAdminInner() {
  const wallet = useWallet();
  const qc = useQueryClient();
  const tx = useContractTx();
  const metrics = useQuery({ queryKey: ["metrics"], queryFn: () => api<Metrics>("/admin/metrics") });
  const [fee, setFee] = useState<string>("");

  async function saveFee() {
    const bps = Number(fee);
    if (!Number.isInteger(bps) || bps < 0 || bps > 300) return tx.setError("La comisión va de 0 a 300 bps (3%)");
    const hash = tx.config?.demo
      ? "demo"
      : await tx.run((d) => buildInvoke(d, wallet.address!, d.contracts.fee_splitter, "set_fee", [nativeToScVal(bps, { type: "u32" })]));
    if (hash) {
      await api("/admin/settings/fee", { method: "PUT", body: { feeBps: bps } });
      await qc.invalidateQueries({ queryKey: ["metrics"] });
    }
  }
  async function pause(contract: "payment_link" | "escrow" | "fee_splitter" | "kyc_registry", on: boolean) {
    if (!confirm(`¿Seguro que quieres ${on ? "pausar" : "reanudar"} ${contract}?`)) return;
    await tx.run((d) => buildInvoke(d, wallet.address!, d.contracts[contract], on ? "pause" : "unpause", []));
  }

  if (metrics.isLoading) return <Spinner />;
  const m = metrics.data;
  return (
    <Page title="Super admin">
      <ErrorNote>{metrics.error?.message ?? tx.error}</ErrorNote>
      <div className="grid gap-4 md:grid-cols-4">
        <Card><p className="text-sm text-gris">Comercios</p><p className="text-2xl font-bold">{m?.merchants.total ?? 0}</p><p className="text-xs text-gris">{m?.merchants.verified ?? 0} verificados</p></Card>
        <Card><p className="text-sm text-gris">Links</p><p className="text-2xl font-bold">{m?.links.total ?? 0}</p><p className="text-xs text-gris">{m?.links.open ?? 0} activos</p></Card>
        {m?.volume.map((v) => (
          <Card key={v.asset}>
            <p className="text-sm text-gris">Volumen {v.asset}</p>
            <p className="text-2xl font-bold">{money(v.gross, v.asset)}</p>
            <p className="text-xs text-gris">{v.count} cobros · comisiones {money(v.fees, v.asset)}</p>
          </Card>
        ))}
      </div>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="text-lg font-bold">Comisión</h2>
          <p className="text-sm text-gris">Actual: {m?.feeBps} bps ({((m?.feeBps ?? 0) / 100).toFixed(2)}%). Máximo on-chain: 300 bps.</p>
          <div className="flex gap-2">
            <Input type="number" min={0} max={300} placeholder="90" value={fee} onChange={(e) => setFee(e.target.value)} />
            <Button onClick={saveFee} loading={tx.pending}>Firmar y guardar</Button>
          </div>
        </Card>
        <Card className="space-y-3">
          <h2 className="text-lg font-bold">Pausa de emergencia</h2>
          <p className="text-sm text-gris">Requiere la wallet super_admin de los contratos.</p>
          <div className="grid grid-cols-2 gap-2">
            {(["payment_link", "escrow", "fee_splitter", "kyc_registry"] as const).map((c) => (
              <div key={c} className="flex gap-1">
                <Button variant="danger" className="flex-1" onClick={() => pause(c, true)} disabled={tx.config?.demo}>Pausar {c}</Button>
                <Button variant="secondary" onClick={() => pause(c, false)} disabled={tx.config?.demo}>▶</Button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Page>
  );
}

export function AcceptInvite() {
  const { id } = useParams({ strict: false }) as { id: string };
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <RequireLogin>
      {() => (
        <Page>
          <Card className="mx-auto max-w-md space-y-4 p-8 text-center">
            <h1 className="text-2xl font-extrabold">Te invitaron a cobrar</h1>
            <p className="text-gris">Al aceptar podrás crear cobros y ver los del día de este comercio.</p>
            <ErrorNote>{error}</ErrorNote>
            <Button
              size="lg"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/auth/invitations/${id}/accept`, { method: "POST" });
                  await qc.invalidateQueries({ queryKey: ["me"] });
                  navigate({ to: "/app" });
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Aceptar invitación
            </Button>
          </Card>
        </Page>
      )}
    </RequireLogin>
  );
}

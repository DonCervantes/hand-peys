import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, IdCard, Loader2, Store } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { RequireLogin } from "../components/Guard";
import { Page } from "../components/Layout";
import { Button, Card, ErrorNote, Field, Input, Select } from "../components/ui";
import { api, type Merchant } from "../lib/api";
import { SimulatedKyc } from "../components/SimulatedKyc";
import { useWallet } from "../lib/wallet";

function CreateMerchant() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api("/merchants", { body: { name: f.get("name"), category: f.get("category"), city: f.get("city") || undefined } });
      await qc.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="¿Cómo se llama tu negocio?">
        <Input name="name" required minLength={2} maxLength={80} placeholder="Tamales Doña Lupe" />
      </Field>
      <Field label="¿Qué tipo de negocio es?">
        <Select name="category" defaultValue="changarro">
          <option value="changarro">Changarro / puesto / tiendita</option>
          <option value="freelance">Freelance / servicios</option>
          <option value="pyme">PyME</option>
        </Select>
      </Field>
      <Field label="Ciudad o colonia (opcional)">
        <Input name="city" maxLength={80} placeholder="Coyoacán, CDMX" />
      </Field>
      <ErrorNote>{error}</ErrorNote>
      <Button type="submit" size="lg" loading={busy} className="w-full">
        Continuar
      </Button>
    </form>
  );
}

function Kyc({ merchant }: { merchant: Merchant }) {
  const wallet = useWallet();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);

  async function sync() {
    setSyncing(true);
    setError(null);
    try {
      // La API vuelve a consultar el estado en Pollar del lado del servidor.
      for (let i = 0; i < 20; i++) {
        const r = await api<{ status: string }>(`/merchants/${merchant.id}/kyc/sync`, { method: "POST" });
        if (r.status === "approved") {
          await qc.invalidateQueries({ queryKey: ["me"] });
          navigate({ to: "/app" });
          return;
        }
        if (r.status === "rejected") throw new Error("Tu verificación fue rechazada. Escríbenos para revisarla.");
        await new Promise((res) => setTimeout(res, 3000));
      }
      setError("Tu verificación sigue en revisión. Te avisamos en cuanto quede.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (merchant.kycStatus === "approved") navigate({ to: "/app" });
  }, [merchant.kycStatus, navigate]);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl bg-crema p-4">
        <IdCard className="mt-0.5 size-6 shrink-0 text-oro-dark" />
        <p className="text-sm">
          Te pediremos tu <b>INE</b> y una <b>selfie</b>. Es una sola vez y tarda un par de minutos. Tus datos los procesa nuestro proveedor de identidad; nosotros solo
          guardamos que ya estás verificado.
        </p>
      </div>
      {merchant.kycStatus === "pending" && (
        <p className="flex items-center gap-2 text-sm text-amber-800">
          <Loader2 className="size-4 animate-spin" /> Tu verificación está en revisión.
        </p>
      )}
      {merchant.kycStatus === "suspended" && <ErrorNote>Tu comercio está suspendido. Contacta a soporte.</ErrorNote>}
      <ErrorNote>{error}</ErrorNote>
      {simulating && merchant.kycStatus !== "pending" ? (
        <SimulatedKyc onDone={sync} busy={syncing} />
      ) : (
        <Button
          size="lg"
          className="w-full"
          loading={syncing}
          disabled={merchant.kycStatus === "suspended"}
          onClick={() => (wallet.kind === "demo" ? setSimulating(true) : wallet.openKyc(sync))}
        >
          <BadgeCheck className="size-5" /> Verificar mi identidad
        </Button>
      )}
      {merchant.kycStatus === "pending" && (
        <Button variant="secondary" className="w-full" onClick={sync} loading={syncing}>
          Ya terminé, revisar estado
        </Button>
      )}
    </div>
  );
}

export function Onboarding() {
  return (
    <RequireLogin>
      {(me) => {
        const m = me.merchants.find((x) => x.role === "comercio_owner");
        return (
          <Page>
            <div className="mx-auto max-w-md">
              <ol className="mb-6 flex gap-2 text-sm">
                <li className={`flex-1 rounded-full py-1 text-center ${!m ? "bg-tinta text-white" : "bg-nopal-soft text-nopal"}`}>1. Tu negocio</li>
                <li className={`flex-1 rounded-full py-1 text-center ${m ? "bg-tinta text-white" : "bg-black/5 text-gris"}`}>2. Verificación</li>
              </ol>
              <Card className="p-6">
                <div className="mb-5 flex items-center gap-3">
                  <Store className="size-7 text-oro-dark" />
                  <h1 className="text-2xl font-extrabold">{m ? `Verifica “${m.name}”` : "Registra tu negocio"}</h1>
                </div>
                {m ? <Kyc merchant={m} /> : <CreateMerchant />}
              </Card>
            </div>
          </Page>
        );
      }}
    </RequireLogin>
  );
}

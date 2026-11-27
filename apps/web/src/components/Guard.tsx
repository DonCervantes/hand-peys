import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { Me, Merchant } from "../lib/api";
import { useSession } from "../lib/session";
import { Page } from "./Layout";
import { LoginPanel } from "./LoginPanel";
import { Card, Spinner } from "./ui";

export function RequireLogin({ children }: { children: (me: Me) => ReactNode }) {
  const { me, loggedIn, loading } = useSession();
  if (loading && !me) return <Spinner label="Entrando…" />;
  if (!loggedIn || !me)
    return (
      <Page>
        <Card className="mx-auto max-w-md space-y-4 p-8 text-center">
          <h1 className="text-2xl font-extrabold">Entra para continuar</h1>
          <p className="text-gris">Usa Google o tu correo. No necesitas frases semilla ni nada raro.</p>
          <LoginPanel />
        </Card>
      </Page>
    );
  return <>{children(me)}</>;
}

/** MVP: el comercio activo es el primero de la lista. */
export function RequireMerchant({ children, ownerOnly }: { children: (m: Merchant, me: Me) => ReactNode; ownerOnly?: boolean }) {
  return (
    <RequireLogin>
      {(me) => {
        const m = me.merchants[0];
        if (!m) return <Navigate to="/app/registro" />;
        if (m.role === "comercio_owner" && m.kycStatus !== "approved") return <Navigate to="/app/registro" />;
        if (ownerOnly && m.role !== "comercio_owner")
          return (
            <Page>
              <Card>Solo el dueño del comercio puede ver esto.</Card>
            </Page>
          );
        return <>{children(m, me)}</>;
      }}
    </RequireLogin>
  );
}

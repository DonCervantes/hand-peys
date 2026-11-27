import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { Layout } from "./components/Layout";
import { reportError } from "./lib/report";
import { AcceptInvite, Compliance, SuperAdmin } from "./routes/Admin";
import { Checkout } from "./routes/Checkout";
import { LinkDetail, NewLink } from "./routes/Cobrar";
import { Payments, Team } from "./routes/Cobros";
import { Dashboard } from "./routes/Dashboard";
import { Landing } from "./routes/Landing";
import { Onboarding } from "./routes/Onboarding";

const root = createRootRoute({ component: Outlet });

// Checkout público sin header de la app (se ve como página de pago).
const checkout = createRoute({ getParentRoute: () => root, path: "/p/$id", component: Checkout });

const shell = createRoute({ getParentRoute: () => root, id: "shell", component: Layout });
const routes = [
  createRoute({ getParentRoute: () => shell, path: "/", component: Landing }),
  createRoute({ getParentRoute: () => shell, path: "/app", component: Dashboard }),
  createRoute({ getParentRoute: () => shell, path: "/app/registro", component: Onboarding }),
  createRoute({ getParentRoute: () => shell, path: "/app/cobrar", component: NewLink }),
  createRoute({ getParentRoute: () => shell, path: "/app/links/$id", component: LinkDetail }),
  createRoute({ getParentRoute: () => shell, path: "/app/cobros", component: Payments }),
  createRoute({ getParentRoute: () => shell, path: "/app/equipo", component: Team }),
  createRoute({ getParentRoute: () => shell, path: "/invitacion/$id", component: AcceptInvite }),
  createRoute({ getParentRoute: () => shell, path: "/admin", component: SuperAdmin }),
  createRoute({ getParentRoute: () => shell, path: "/admin/cumplimiento", component: Compliance }),
];

function RouteError({ error }: { error: unknown }) {
  useEffect(() => reportError("router", error), [error]);
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-2xl font-extrabold">Algo falló en esta página</p>
      <pre className="mt-4 overflow-auto rounded-xl bg-black/5 p-3 text-left text-xs">{error instanceof Error ? error.message : String(error)}</pre>
      <button className="mt-4 rounded-xl bg-tinta px-4 py-2 font-semibold text-white" onClick={() => location.reload()}>
        Recargar
      </button>
    </div>
  );
}

export const router = createRouter({
  routeTree: root.addChildren([checkout, shell.addChildren(routes)]),
  defaultErrorComponent: RouteError,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

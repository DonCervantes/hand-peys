import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { Layout } from "./components/Layout";
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

export const router = createRouter({ routeTree: root.addChildren([checkout, shell.addChildren(routes)]) });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

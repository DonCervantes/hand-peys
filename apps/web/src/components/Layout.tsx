import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { useSession } from "../lib/session";
import { useWallet } from "../lib/wallet";
import { cn, shortAddr } from "../lib/format";
import { Button } from "./ui";

export function Logo() {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2 whitespace-nowrap font-display text-xl font-extrabold">
      <span className="grid size-8 place-items-center rounded-lg bg-rosa text-crema">$</span>
      Hand Peys
    </Link>
  );
}

export function LoginButton({ size = "md", children = "Entrar" }: { size?: "md" | "lg"; children?: ReactNode }) {
  const wallet = useWallet();
  const { loading, signIn } = useSession();
  // Wallet ya conectada (p. ej. sesión de Pollar activa) pero sin sesión de Hand Peys: reintenta la firma.
  if (wallet.ready && wallet.address)
    return (
      <Button size={size} loading={loading} onClick={() => void signIn()}>
        Confirmar con mi wallet
      </Button>
    );
  if (wallet.login)
    return (
      <Link to="/app" className={cn("inline-flex items-center justify-center rounded-xl bg-rosa px-4 font-semibold text-white", size === "lg" ? "h-12 text-base" : "h-10 text-sm")}>
        {children}
      </Link>
    );
  return (
    <Button size={size} loading={loading} onClick={() => wallet.connect()}>
      {children}
    </Button>
  );
}

function NavLink({ to, children }: { to: string; children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const active = path === to || (to !== "/app" && path.startsWith(to));
  return (
    <Link to={to} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", active ? "bg-rosa-soft text-rosa-dark" : "text-gris hover:text-tinta")}>
      {children}
    </Link>
  );
}

export function Header() {
  const { loggedIn, me, signOut } = useSession();
  const wallet = useWallet();
  const role = me?.user.platformRole;
  return (
    <header className="sticky top-0 z-30 border-b border-linea bg-crema/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Logo />
        {loggedIn ? (
          <div className="flex items-center gap-1 overflow-x-auto">
            {me?.merchants.length ? (
              <>
                <NavLink to="/app">Inicio</NavLink>
                <NavLink to="/app/cobrar">Cobrar</NavLink>
                <NavLink to="/app/cobros">Cobros</NavLink>
              </>
            ) : null}
            {(role === "cumplimiento" || role === "super_admin") && <NavLink to="/admin/cumplimiento">Cumplimiento</NavLink>}
            {role === "super_admin" && <NavLink to="/admin">Admin</NavLink>}
            <span className="ml-2 hidden text-xs text-gris sm:inline" title={wallet.address ?? ""}>
              {shortAddr(wallet.address)}
            </span>
            <Button variant="ghost" onClick={signOut} aria-label="Salir">
              <LogOut className="size-4" />
            </Button>
          </div>
        ) : (
          <LoginButton />
        )}
      </div>
      {wallet.kind === "demo" && (
        <div className="bg-maiz/25 px-4 py-1 text-center text-xs text-amber-900">
          Modo demo: wallet de prueba en este navegador (sin Pollar). Configura VITE_POLLAR_API_KEY para usar Pollar.
        </div>
      )}
    </header>
  );
}

export function Layout() {
  return (
    <div className="min-h-dvh">
      <Header />
      <Outlet />
    </div>
  );
}

export function Page({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {title && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-extrabold">{title}</h1>
          {actions}
        </div>
      )}
      {children}
    </main>
  );
}

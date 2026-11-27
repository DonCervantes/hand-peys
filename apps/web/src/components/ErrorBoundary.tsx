import { Component, type ReactNode } from "react";
import { reportError } from "../lib/report";

/** Si algo rompe la interfaz, mostramos un aviso (y lo reportamos) en vez de una página en blanco. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    reportError("react.boundary", error, info.componentStack?.slice(0, 600) ?? "");
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-2xl font-extrabold">Algo falló en esta página</p>
        <p className="mt-2 text-sm text-gris">
          Si tienes extensiones que modifican formularios (gestores de contraseñas, correctores), prueba en una ventana de
          incógnito.
        </p>
        <pre className="mt-4 overflow-auto rounded-xl bg-black/5 p-3 text-left text-xs">{this.state.error.message}</pre>
        <button className="mt-4 rounded-xl bg-rosa px-4 py-2 font-semibold text-white" onClick={() => location.reload()}>
          Recargar
        </button>
      </div>
    );
  }
}

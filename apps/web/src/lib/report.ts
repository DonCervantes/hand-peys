/** Envía errores del navegador a la API (/api/client-log) para diagnosticar fallas que no vemos. */
let sent = 0;
export function reportError(kind: string, err: unknown, extra?: string) {
  if (sent++ > 20) return; // tope por carga de página
  const e = err as { message?: string; stack?: string } | undefined;
  const body = JSON.stringify({
    kind,
    message: (e?.message ?? String(err)) + (extra ? ` | ${extra}` : ""),
    stack: e?.stack ?? "",
    url: location.pathname + location.search,
  });
  try {
    if (!navigator.sendBeacon?.("/api/client-log", new Blob([body], { type: "application/json" })))
      void fetch("/api/client-log", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true });
  } catch {
    /* sin red: nada que hacer */
  }
}

export function installGlobalReporters() {
  window.addEventListener("error", (ev) => reportError("window.error", ev.error ?? ev.message));
  window.addEventListener("unhandledrejection", (ev) => reportError("unhandledrejection", ev.reason));
}

import { formatMoney, type AssetCode } from "@hand-peys/shared";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));
export const money = (units: string | bigint, asset: AssetCode = "MXNE") => formatMoney(units, asset);
export const shortAddr = (a?: string | null) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "");
export const fecha = (ms: number) =>
  new Date(ms).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" });

export const LINK_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "muted" | "bad" }> = {
  pending: { label: "Confirmando", tone: "warn" },
  open: { label: "Activo", tone: "ok" },
  paid: { label: "Pagado", tone: "ok" },
  cancelled: { label: "Cancelado", tone: "muted" },
  expired: { label: "Vencido", tone: "muted" },
};

export const PAYMENT_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "muted" | "bad" }> = {
  settled: { label: "Recibido", tone: "ok" },
  held: { label: "En garantía", tone: "warn" },
  released: { label: "Liberado", tone: "ok" },
  refunded: { label: "Reembolsado", tone: "muted" },
  disputed: { label: "En disputa", tone: "bad" },
  resolved: { label: "Resuelto", tone: "muted" },
};

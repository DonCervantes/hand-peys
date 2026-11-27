import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../lib/format";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-tinta text-white hover:bg-black shadow-[0_3px_0_0_var(--color-oro)] active:translate-y-[2px] active:shadow-none",
  secondary: "bg-white text-tinta border border-linea hover:border-tinta/30",
  ghost: "text-tinta hover:bg-black/5",
  danger: "bg-white text-red-700 border border-red-200 hover:bg-red-50",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; size?: "md" | "lg" }
>(({ className, variant = "primary", loading, size = "md", children, disabled, ...rest }, ref) => (
  <button
    ref={ref}
    disabled={disabled || loading}
    className={cn(
      "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:opacity-50 disabled:pointer-events-none",
      size === "lg" ? "h-13 px-6 text-base" : "h-10 px-4 text-sm",
      variants[variant],
      className
    )}
    {...rest}
  >
    {loading && <Loader2 className="size-4 animate-spin" />}
    {children}
  </button>
));

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-2xl border border-linea bg-white p-5", className)}>{children}</div>;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...rest }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-11 w-full rounded-xl border border-linea bg-white px-3 text-base outline-none transition focus:border-tinta focus:ring-2 focus:ring-oro/30",
      className
    )}
    {...rest}
  />
));

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn("h-11 w-full rounded-xl border border-linea bg-white px-3 text-base outline-none focus:border-tinta", className)}
      {...rest}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-gris">{hint}</span>}
    </label>
  );
}

const tones = {
  ok: "bg-nopal-soft text-nopal",
  warn: "bg-maiz/20 text-amber-800",
  muted: "bg-black/5 text-gris",
  bad: "bg-red-100 text-red-700",
};
export function Badge({ tone = "muted", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone])}>{children}</span>;
}

export function ErrorNote({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p>;
}

export function Spinner({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-gris">
      <Loader2 className="size-5 animate-spin" /> {label}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-linea p-8 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-gris">{children}</div>}
    </div>
  );
}

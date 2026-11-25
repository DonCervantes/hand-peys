/**
 * Cliente de servidor para Pollar (auth + KYC).
 *
 * ⚠️ HP-016: las rutas exactas de la API de servidor de Pollar se deben
 * confirmar contra docs.pollar.xyz y el `.d.ts` de `@pollar/core`. Todo lo
 * específico de Pollar vive en este archivo para cambiarlo en un solo lugar.
 *
 * Modo desarrollo: si ENVIRONMENT=local y no hay POLLAR_SECRET, se aceptan
 * tokens `dev:<wallet G...>:<email>` y el KYC se aprueba al sincronizar.
 */
import type { Env } from "./env";

export interface PollarIdentity {
  pollarId: string;
  email: string | null;
  wallet: string;
}

export type PollarKycState = "not_started" | "pending" | "approved" | "rejected";

export interface PollarKyc {
  state: PollarKycState;
  level: 0 | 1 | 2;
  /** Referencia de la verificación (Didit). Nunca se guarda on-chain, solo su hash. */
  reference: string | null;
}

const devMode = (env: Env) => env.ENVIRONMENT === "local" && !env.POLLAR_SECRET;

async function pollarFetch<T>(env: Env, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.POLLAR_API_URL}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.POLLAR_SECRET}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Pollar ${path} → ${res.status}`);
  return (await res.json()) as T;
}

/** Valida el token de sesión que el front obtuvo de `@pollar/react`. */
export async function verifyPollarSession(env: Env, token: string): Promise<PollarIdentity> {
  if (devMode(env)) {
    const [prefix, wallet, email] = token.split(":");
    if (prefix !== "dev" || !wallet || !/^G[A-Z2-7]{55}$/.test(wallet)) throw new Error("Token dev inválido");
    return { pollarId: `dev_${wallet}`, email: email ?? null, wallet };
  }
  // TODO(HP-016): confirmar endpoint y forma de respuesta.
  const data = await pollarFetch<{ user: { id: string; email?: string }; wallet: { address: string } }>(
    env,
    "/v1/sessions/verify",
    { method: "POST", body: JSON.stringify({ token }) }
  );
  return { pollarId: data.user.id, email: data.user.email ?? null, wallet: data.wallet.address };
}

/** Consulta el estado de KYC del usuario directamente en Pollar (no confiamos en el cliente). */
export async function getPollarKyc(env: Env, pollarId: string): Promise<PollarKyc> {
  if (devMode(env)) return { state: "approved", level: 1, reference: `dev-ref-${pollarId}` };
  // TODO(HP-016): confirmar endpoint (equivalente de servidor a getKycStatus).
  const data = await pollarFetch<{ status: string; level?: number; verificationId?: string }>(
    env,
    `/v1/users/${encodeURIComponent(pollarId)}/kyc`
  );
  const state: PollarKycState =
    data.status === "approved" || data.status === "verified"
      ? "approved"
      : data.status === "rejected" || data.status === "declined"
        ? "rejected"
        : data.status === "not_started"
          ? "not_started"
          : "pending";
  const level = (state === "approved" ? Math.min(2, Math.max(1, data.level ?? 1)) : 0) as 0 | 1 | 2;
  return { state, level, reference: data.verificationId ?? null };
}

export async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

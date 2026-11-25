import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { sign, verify } from "hono/jwt";
import { can, type Permission, type Role } from "@hand-peys/shared";
import * as s from "./db/schema";
import type { AppEnv, Env, SessionUser } from "./env";

export const SESSION_COOKIE = "hp_session";
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 días

export const db = (env: Env) => drizzle(env.DB, { schema: s });

export async function issueSession(env: Env, userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: userId, iat: now, exp: now + SESSION_TTL }, env.SESSION_SECRET, "HS256");
}

function readToken(c: Context<AppEnv>): string | null {
  const h = c.req.header("authorization");
  if (h?.startsWith("Bearer ")) return h.slice(7);
  return getCookie(c, SESSION_COOKIE) ?? null;
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = readToken(c);
  if (!token) throw new HTTPException(401, { message: "Inicia sesión" });
  let sub: string;
  try {
    const payload = await verify(token, c.env.SESSION_SECRET, "HS256");
    sub = String(payload.sub);
  } catch {
    throw new HTTPException(401, { message: "Sesión inválida o expirada" });
  }
  const user = await db(c.env).query.users.findFirst({ where: eq(s.users.id, sub) });
  if (!user) throw new HTTPException(401, { message: "Usuario no encontrado" });
  c.set("user", {
    id: user.id,
    pollarId: user.pollarId,
    email: user.email,
    wallet: user.wallet,
    platformRole: user.platformRole ?? null,
  } satisfies SessionUser);
  await next();
};

/** Solo super_admin / cumplimiento. super_admin también puede lo de cumplimiento. */
export const requirePlatform =
  (perm: Permission): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const role = c.get("user").platformRole;
    if (!role || !can(role, perm)) throw new HTTPException(403, { message: "Sin permiso" });
    await next();
  };

export async function merchantRole(env: Env, userId: string, merchantId: string): Promise<Role | null> {
  const m = await db(env).query.memberships.findFirst({
    where: and(eq(s.memberships.userId, userId), eq(s.memberships.merchantId, merchantId)),
  });
  return m?.role ?? null;
}

/** Verifica que el usuario tenga `perm` en el comercio; regresa su rol. */
export async function assertMerchantPerm(
  c: Context<AppEnv>,
  merchantId: string,
  perm: Permission
): Promise<Role> {
  const role = await merchantRole(c.env, c.get("user").id, merchantId);
  if (!role || !can(role, perm)) throw new HTTPException(403, { message: "Sin permiso en este comercio" });
  return role;
}

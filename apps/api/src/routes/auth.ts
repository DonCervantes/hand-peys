import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db, issueSession, requireAuth, SESSION_COOKIE } from "../auth";
import * as s from "../db/schema";
import type { AppEnv, Env } from "../env";
import { stellarAddressSchema } from "@hand-peys/shared";
import { challengeMessage, verifySep53 } from "../sep53";

const list = (v?: string) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

function platformRoleFor(env: Env, wallet: string): "super_admin" | "cumplimiento" | null {
  if (list(env.SUPER_ADMIN_WALLETS).includes(wallet)) return "super_admin";
  if (list(env.COMPLIANCE_WALLETS).includes(wallet)) return "cumplimiento";
  return null;
}

export const authRoutes = new Hono<AppEnv>()
  /** Paso 1: reto de un solo uso (5 min) para la wallet. */
  .post("/challenge", async (c) => {
    const body = z.object({ wallet: stellarAddressSchema }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success || !body.data.wallet.startsWith("G")) throw new HTTPException(400, { message: "Wallet inválida" });
    const nonce = crypto.randomUUID();
    const message = challengeMessage(body.data.wallet, nonce, Date.now(), new URL(c.env.APP_URL).host);
    await c.env.KV.put(`challenge:${body.data.wallet}:${nonce}`, message, { expirationTtl: 300 });
    return c.json({ nonce, message });
  })

  /** Paso 2: la wallet de Pollar firma el reto (SEP-53) y lo cambiamos por una sesión. */
  .post("/session", async (c) => {
    const body = z
      .object({
        wallet: stellarAddressSchema,
        nonce: z.string().uuid(),
        signature: z.string().min(64),
        email: z.string().email().optional(),
        pollarUserId: z.string().max(128).optional(),
      })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) throw new HTTPException(400, { message: "Datos de inicio de sesión incompletos" });
    const { wallet, nonce, signature } = body.data;
    const key = `challenge:${wallet}:${nonce}`;
    const message = await c.env.KV.get(key);
    if (!message) throw new HTTPException(401, { message: "El reto expiró, intenta de nuevo" });
    await c.env.KV.delete(key);
    if (!(await verifySep53(wallet, message, signature))) throw new HTTPException(401, { message: "Firma inválida" });
    const identity = { pollarId: body.data.pollarUserId ?? wallet, email: body.data.email?.toLowerCase() ?? null, wallet };

    const d = db(c.env);
    let user = await d.query.users.findFirst({ where: eq(s.users.wallet, identity.wallet) });
    const role = platformRoleFor(c.env, identity.wallet);
    if (!user) {
      user = { id: crypto.randomUUID(), pollarId: identity.pollarId, email: identity.email, wallet: identity.wallet, platformRole: role, createdAt: Date.now() };
      await d.insert(s.users).values(user);
    } else if ((identity.email && user.email !== identity.email) || (role && user.platformRole !== role)) {
      await d.update(s.users).set({ email: identity.email ?? user.email, platformRole: role ?? user.platformRole }).where(eq(s.users.id, user.id));
    }
    const token = await issueSession(c.env, user.id);
    setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
    return c.json({ token, user: { id: user.id, email: identity.email, wallet: identity.wallet } });
  })
  .post("/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  })
  /** Acepta una invitación de cajero (el id es un secreto de un solo uso que comparte el dueño). */
  .post("/invitations/:id/accept", requireAuth, async (c) => {
    const d = db(c.env);
    const inv = await d.query.invitations.findFirst({ where: eq(s.invitations.id, c.req.param("id")) });
    if (!inv || inv.acceptedAt) throw new HTTPException(404, { message: "Invitación no válida o ya usada" });
    const user = c.get("user");
    await d.batch([
      d.insert(s.memberships).values({ userId: user.id, merchantId: inv.merchantId, role: "comercio_cajero", createdAt: Date.now() }).onConflictDoNothing(),
      d.update(s.invitations).set({ acceptedAt: Date.now() }).where(eq(s.invitations.id, inv.id)),
    ]);
    return c.json({ merchantId: inv.merchantId });
  })
  .get("/me", requireAuth, async (c) => {
    const user = c.get("user");
    const rows = await db(c.env)
      .select({ merchant: s.merchants, role: s.memberships.role })
      .from(s.memberships)
      .innerJoin(s.merchants, eq(s.merchants.id, s.memberships.merchantId))
      .where(eq(s.memberships.userId, user.id));
    return c.json({
      user,
      merchants: rows.map((r) => ({ ...r.merchant, role: r.role })),
    });
  });

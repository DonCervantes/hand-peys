import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db, issueSession, requireAuth, SESSION_COOKIE } from "../auth";
import * as s from "../db/schema";
import type { AppEnv, Env } from "../env";
import { verifyPollarSession } from "../pollar";

const list = (v?: string) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

function platformRoleFor(env: Env, wallet: string): "super_admin" | "cumplimiento" | null {
  if (list(env.SUPER_ADMIN_WALLETS).includes(wallet)) return "super_admin";
  if (list(env.COMPLIANCE_WALLETS).includes(wallet)) return "cumplimiento";
  return null;
}

export const authRoutes = new Hono<AppEnv>()
  /** Intercambia el token de Pollar por una sesión de Hand Peys. */
  .post("/session", async (c) => {
    const body = z.object({ pollarToken: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) throw new HTTPException(400, { message: "Falta pollarToken" });
    let identity;
    try {
      identity = await verifyPollarSession(c.env, body.data.pollarToken);
    } catch {
      throw new HTTPException(401, { message: "No pudimos validar tu sesión de Pollar" });
    }
    const d = db(c.env);
    let user = await d.query.users.findFirst({ where: eq(s.users.pollarId, identity.pollarId) });
    const role = platformRoleFor(c.env, identity.wallet);
    if (!user) {
      user = { id: crypto.randomUUID(), pollarId: identity.pollarId, email: identity.email, wallet: identity.wallet, platformRole: role, createdAt: Date.now() };
      await d.insert(s.users).values(user);
    } else if (user.wallet !== identity.wallet || user.email !== identity.email || (role && user.platformRole !== role)) {
      await d.update(s.users).set({ wallet: identity.wallet, email: identity.email, platformRole: role ?? user.platformRole }).where(eq(s.users.id, user.id));
    }
    // Acepta invitaciones pendientes como cajero.
    if (identity.email) {
      const invites = await d.query.invitations.findMany({
        where: and(eq(s.invitations.email, identity.email.toLowerCase()), isNull(s.invitations.acceptedAt)),
      });
      for (const inv of invites) {
        await d.insert(s.memberships).values({ userId: user.id, merchantId: inv.merchantId, role: "comercio_cajero", createdAt: Date.now() }).onConflictDoNothing();
        await d.update(s.invitations).set({ acceptedAt: Date.now() }).where(eq(s.invitations.id, inv.id));
      }
    }
    const token = await issueSession(c.env, user.id);
    setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
    return c.json({ token, user: { id: user.id, email: identity.email, wallet: identity.wallet } });
  })
  .post("/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
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

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { rpc } from "@stellar/stellar-sdk";
import {
  createLinkSchema,
  createMerchantSchema,
  inviteMemberSchema,
  newLinkId,
  submittedTxSchema,
  toUnits,
} from "@hand-peys/shared";
import { server } from "@hand-peys/stellar";
import { assertMerchantPerm, db, requireAuth } from "../auth";
import * as s from "../db/schema";
import { getDeployment, isDeployed, type AppEnv } from "../env";
import { syncMerchantKyc } from "../services/kyc";

const startOfTodayMx = () => {
  // Día calendario en CDMX (UTC-6, sin horario de verano desde 2022).
  const now = Date.now() - 6 * 3600_000;
  return now - (now % 86_400_000) + 6 * 3600_000;
};

export const merchantRoutes = new Hono<AppEnv>()
  .use(requireAuth)
  .post("/", async (c) => {
    const user = c.get("user");
    if (!user.wallet) throw new HTTPException(400, { message: "Tu cuenta no tiene wallet todavía" });
    const input = createMerchantSchema.parse(await c.req.json());
    const id = crypto.randomUUID();
    const now = Date.now();
    await db(c.env).batch([
      db(c.env).insert(s.merchants).values({ id, ownerUserId: user.id, name: input.name, category: input.category, city: input.city ?? null, wallet: user.wallet, createdAt: now }),
      db(c.env).insert(s.memberships).values({ userId: user.id, merchantId: id, role: "comercio_owner", createdAt: now }),
    ]);
    return c.json({ id }, 201);
  })

  .get("/:mid", async (c) => {
    const mid = c.req.param("mid");
    const role = await assertMerchantPerm(c, mid, "payments:view_today");
    const d = db(c.env);
    const merchant = await d.query.merchants.findFirst({ where: eq(s.merchants.id, mid) });
    if (!merchant) throw new HTTPException(404, { message: "Comercio no encontrado" });
    const since = role === "comercio_owner" ? 0 : startOfTodayMx();
    const totals = await d
      .select({
        asset: s.payments.asset,
        count: sql<number>`count(*)`,
        gross: sql<string>`coalesce(sum(cast(${s.payments.amountUnits} as integer)), 0)`,
        fees: sql<string>`coalesce(sum(cast(${s.payments.feeUnits} as integer)), 0)`,
      })
      .from(s.payments)
      .where(and(eq(s.payments.merchantId, mid), gte(s.payments.createdAt, since), sql`${s.payments.status} in ('settled','released','resolved')`))
      .groupBy(s.payments.asset);
    const held = await d
      .select({ asset: s.payments.asset, amount: sql<string>`coalesce(sum(cast(${s.payments.amountUnits} as integer)), 0)` })
      .from(s.payments)
      .where(and(eq(s.payments.merchantId, mid), sql`${s.payments.status} in ('held','disputed')`))
      .groupBy(s.payments.asset);
    const activeLinks = await d.select({ n: sql<number>`count(*)` }).from(s.links).where(and(eq(s.links.merchantId, mid), eq(s.links.status, "open")));
    return c.json({ merchant, role, totals, held, activeLinks: activeLinks[0]?.n ?? 0, scope: since ? "today" : "all" });
  })

  .post("/:mid/kyc/sync", async (c) => {
    const mid = c.req.param("mid");
    await assertMerchantPerm(c, mid, "members:manage"); // solo dueño
    return c.json(await syncMerchantKyc(c.env, mid));
  })

  // ---------- Links ----------
  .get("/:mid/links", async (c) => {
    const mid = c.req.param("mid");
    await assertMerchantPerm(c, mid, "payments:view_today");
    const rows = await db(c.env).query.links.findMany({ where: eq(s.links.merchantId, mid), orderBy: desc(s.links.createdAt), limit: 100 });
    return c.json(rows);
  })

  .post("/:mid/links", async (c) => {
    const mid = c.req.param("mid");
    await assertMerchantPerm(c, mid, "links:create");
    const parsed = createLinkSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, 400);
    const input = parsed.data;
    const merchant = await db(c.env).query.merchants.findFirst({ where: eq(s.merchants.id, mid) });
    if (!merchant) throw new HTTPException(404, { message: "Comercio no encontrado" });
    if (merchant.kycStatus !== "approved") throw new HTTPException(403, { message: "Completa tu verificación para cobrar" });

    const d = getDeployment(c.env.NETWORK);
    const demo = !isDeployed(d) && c.env.ENVIRONMENT === "local";
    const id = newLinkId();
    const expiresAt = input.expiresInHours ? Math.floor(Date.now() / 1000) + input.expiresInHours * 3600 : 0;
    const amountUnits = toUnits(input.amount).toString();
    await db(c.env).insert(s.links).values({
      id,
      merchantId: mid,
      createdBy: c.get("user").id,
      amountUnits,
      asset: input.asset,
      description: input.description,
      mode: input.mode,
      expiresAt,
      status: demo ? "open" : "pending",
      createdAt: Date.now(),
    });
    return c.json(
      {
        id,
        url: `${c.env.APP_URL}/p/${id}`,
        status: demo ? "open" : "pending",
        // Parámetros para que el front construya y firme create_link con la wallet del dueño.
        chain: demo ? null : { merchant: merchant.wallet, id, asset: input.asset, amount: amountUnits, mode: input.mode, expiresAt },
      },
      201
    );
  })

  /** El front avisa que envió create_link/cancel; confirmamos contra el RPC sin esperar al indexer. */
  .post("/:mid/links/:id/submitted", async (c) => {
    const { mid, id } = c.req.param();
    await assertMerchantPerm(c, mid, "links:create");
    const { txHash } = submittedTxSchema.parse(await c.req.json());
    const d = getDeployment(c.env.NETWORK);
    const tx = await server(d).getTransaction(txHash);
    if (tx.status !== rpc.Api.GetTransactionStatus.SUCCESS) return c.json({ status: "pending" }, 202);
    await db(c.env)
      .update(s.links)
      .set({ status: "open", createTxHash: txHash })
      .where(and(eq(s.links.id, id), eq(s.links.merchantId, mid), eq(s.links.status, "pending")));
    return c.json({ status: "open" });
  })

  // ---------- Cobros ----------
  .get("/:mid/payments", async (c) => {
    const mid = c.req.param("mid");
    const role = await assertMerchantPerm(c, mid, "payments:view_today");
    const since = role === "comercio_owner" ? 0 : startOfTodayMx();
    const rows = await db(c.env)
      .select({ payment: s.payments, description: s.links.description, mode: s.links.mode })
      .from(s.payments)
      .innerJoin(s.links, eq(s.links.id, s.payments.linkId))
      .where(and(eq(s.payments.merchantId, mid), gte(s.payments.createdAt, since)))
      .orderBy(desc(s.payments.createdAt))
      .limit(200);
    return c.json(rows.map((r) => ({ ...r.payment, description: r.description, mode: r.mode })));
  })

  // ---------- Colaboradores ----------
  .get("/:mid/members", async (c) => {
    const mid = c.req.param("mid");
    await assertMerchantPerm(c, mid, "members:manage");
    const members = await db(c.env)
      .select({ userId: s.users.id, email: s.users.email, wallet: s.users.wallet, role: s.memberships.role })
      .from(s.memberships)
      .innerJoin(s.users, eq(s.users.id, s.memberships.userId))
      .where(eq(s.memberships.merchantId, mid));
    const invites = await db(c.env).query.invitations.findMany({ where: eq(s.invitations.merchantId, mid) });
    return c.json({
      members,
      invites: invites.filter((i) => !i.acceptedAt).map((i) => ({ ...i, url: `${c.env.APP_URL}/invitacion/${i.id}` })),
    });
  })

  .post("/:mid/members", async (c) => {
    const mid = c.req.param("mid");
    await assertMerchantPerm(c, mid, "members:manage");
    const input = inviteMemberSchema.parse(await c.req.json());
    const id = crypto.randomUUID();
    await db(c.env).insert(s.invitations).values({ id, merchantId: mid, email: input.email.toLowerCase(), role: input.role, createdAt: Date.now() });
    return c.json({ id, url: `${c.env.APP_URL}/invitacion/${id}` }, 201);
  })

  .delete("/:mid/members/:userId", async (c) => {
    const { mid, userId } = c.req.param();
    await assertMerchantPerm(c, mid, "members:manage");
    await db(c.env)
      .delete(s.memberships)
      .where(and(eq(s.memberships.merchantId, mid), eq(s.memberships.userId, userId), eq(s.memberships.role, "comercio_cajero")));
    return c.json({ ok: true });
  });

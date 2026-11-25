import { desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { kycDecisionSchema } from "@hand-peys/shared";
import { db, requireAuth, requirePlatform } from "../auth";
import * as s from "../db/schema";
import type { AppEnv } from "../env";
import { approveMerchant, rejectOrSuspend } from "../services/kyc";

export const adminRoutes = new Hono<AppEnv>()
  .use(requireAuth)

  // ---------- Cumplimiento ----------
  .get("/kyc", requirePlatform("kyc:review"), async (c) => {
    const status = c.req.query("status");
    const rows = await db(c.env).query.merchants.findMany({
      where: status ? eq(s.merchants.kycStatus, status as "pending") : undefined,
      orderBy: desc(s.merchants.createdAt),
      limit: 200,
    });
    return c.json(rows);
  })

  .post("/kyc/:mid", requirePlatform("kyc:review"), async (c) => {
    const input = kycDecisionSchema.parse(await c.req.json());
    const m = await db(c.env).query.merchants.findFirst({ where: eq(s.merchants.id, c.req.param("mid")) });
    if (!m) throw new HTTPException(404, { message: "Comercio no encontrado" });
    const reviewer = c.get("user").id;
    const result =
      input.decision === "approve"
        ? await approveMerchant(c.env, m, input.level, m.kycRef ?? `manual-${m.id}`, reviewer)
        : await rejectOrSuspend(c.env, m, input.decision, reviewer, input.reason);
    return c.json(result);
  })

  .get("/kyc/:mid/history", requirePlatform("kyc:review"), async (c) => {
    const rows = await db(c.env).query.kycReviews.findMany({
      where: eq(s.kycReviews.merchantId, c.req.param("mid")),
      orderBy: desc(s.kycReviews.createdAt),
    });
    return c.json(rows);
  })

  .get("/disputes", requirePlatform("disputes:resolve"), async (c) => {
    const rows = await db(c.env)
      .select({ payment: s.payments, description: s.links.description, merchant: s.merchants.name })
      .from(s.payments)
      .innerJoin(s.links, eq(s.links.id, s.payments.linkId))
      .innerJoin(s.merchants, eq(s.merchants.id, s.payments.merchantId))
      .where(eq(s.payments.status, "disputed"))
      .orderBy(desc(s.payments.updatedAt));
    return c.json(rows.map((r) => ({ ...r.payment, description: r.description, merchant: r.merchant })));
  })

  // ---------- Super admin ----------
  .get("/metrics", requirePlatform("metrics:global"), async (c) => {
    const d = db(c.env);
    const [merchants] = await d.select({ total: sql<number>`count(*)`, verified: sql<number>`sum(case when kyc_status='approved' then 1 else 0 end)` }).from(s.merchants);
    const [links] = await d.select({ total: sql<number>`count(*)`, open: sql<number>`sum(case when status='open' then 1 else 0 end)` }).from(s.links);
    const volume = await d
      .select({
        asset: s.payments.asset,
        count: sql<number>`count(*)`,
        gross: sql<string>`coalesce(sum(cast(amount_units as integer)), 0)`,
        fees: sql<string>`coalesce(sum(cast(fee_units as integer)), 0)`,
      })
      .from(s.payments)
      .groupBy(s.payments.asset);
    const fee = await d.query.settings.findFirst({ where: eq(s.settings.key, "fee_bps") });
    return c.json({ merchants, links, volume, feeBps: Number(fee?.value ?? 90) });
  })

  /** Guarda el fee en D1 después de que el super_admin firmó `fee_splitter.set_fee` desde el front. */
  .put("/settings/fee", requirePlatform("config:fee"), async (c) => {
    const { feeBps } = z.object({ feeBps: z.number().int().min(0).max(300) }).parse(await c.req.json());
    await db(c.env).insert(s.settings).values({ key: "fee_bps", value: String(feeBps) }).onConflictDoUpdate({ target: s.settings.key, set: { value: String(feeBps) } });
    return c.json({ feeBps });
  });

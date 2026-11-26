import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ASSETS, computeFee, formatMoney, linkIdSchema, stellarAddressSchema, toUnits, type AssetCode } from "@hand-peys/shared";
import { explorerTx, getAssetStatus, sendTestAsset } from "@hand-peys/stellar";
import { db } from "../auth";
import * as s from "../db/schema";
import { getDeployment, isDemo, type AppEnv } from "../env";
import { applyEvent, runIndexer } from "../services/indexer";

async function loadLink(c: { env: AppEnv["Bindings"] }, id: string) {
  if (!linkIdSchema.safeParse(id).success) throw new HTTPException(404, { message: "Link no encontrado" });
  const d = db(c.env);
  const link = await d.query.links.findFirst({ where: eq(s.links.id, id) });
  if (!link || link.status === "pending") throw new HTTPException(404, { message: "Link no encontrado" });
  const merchant = await d.query.merchants.findFirst({ where: eq(s.merchants.id, link.merchantId) });
  const payment = await d.query.payments.findFirst({ where: eq(s.payments.linkId, id) });
  return { link, merchant: merchant!, payment };
}

export const publicRoutes = new Hono<AppEnv>()
  /** Datos públicos del checkout. */
  .get("/p/:id", async (c) => {
    const { link, merchant, payment } = await loadLink(c, c.req.param("id"));
    const d = getDeployment(c.env.NETWORK);
    const expired = link.expiresAt > 0 && link.expiresAt * 1000 < Date.now();
    return c.json({
      id: link.id,
      description: link.description,
      amountUnits: link.amountUnits,
      asset: link.asset,
      mode: link.mode,
      status: expired && link.status === "open" ? "expired" : link.status,
      expiresAt: link.expiresAt,
      merchant: { name: merchant.name, city: merchant.city, category: merchant.category, wallet: merchant.wallet, verified: merchant.kycStatus === "approved" },
      payment: payment ? { status: payment.status, payer: payment.payer, txHash: payment.txHash, createdAt: payment.createdAt, explorerUrl: explorerTx(d, payment.txHash) } : null,
      chain: { network: d.network, demo: isDemo(c.env), paymentLink: d.contracts.payment_link, escrow: d.contracts.escrow, token: d.tokens[link.asset as AssetCode]?.contractId ?? null },
    });
  })

  /** Comprobante imprimible (HTML). TODO(HP-028): versión PDF en R2. */
  .get("/p/:id/receipt", async (c) => {
    const { link, merchant, payment } = await loadLink(c, c.req.param("id"));
    if (!payment) throw new HTTPException(404, { message: "Este link aún no se paga" });
    const d = getDeployment(c.env.NETWORK);
    const asset = link.asset as AssetCode;
    const esc = (v: string) => v.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
    const date = new Date(payment.createdAt).toLocaleString("es-MX", { timeZone: "America/Mexico_City" });
    return c.html(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Comprobante Hand Peys</title><style>body{font-family:system-ui,sans-serif;max-width:480px;margin:40px auto;padding:0 16px;color:#1a1a1a}
h1{font-size:20px}dl{display:grid;grid-template-columns:auto 1fr;gap:8px 16px}dt{color:#666}dd{margin:0;word-break:break-all}.amt{font-size:32px;font-weight:700;margin:16px 0}
@media print{button{display:none}}</style></head><body>
<h1>Comprobante de pago · Hand Peys</h1><div class="amt">${formatMoney(payment.amountUnits, asset)}</div>
<dl><dt>Concepto</dt><dd>${esc(link.description)}</dd><dt>Comercio</dt><dd>${esc(merchant.name)}</dd><dt>Fecha</dt><dd>${date}</dd>
<dt>Activo</dt><dd>${ASSETS[asset].label}</dd><dt>Estado</dt><dd>${payment.status}</dd><dt>Red</dt><dd>Stellar ${d.network}</dd>
<dt>Transacción</dt><dd><a href="${explorerTx(d, payment.txHash)}">${payment.txHash}</a></dd></dl>
<p><button onclick="print()">Imprimir / Guardar PDF</button></p></body></html>`);
  })

  /** Después de firmar un pago, el front pide indexar ya en vez de esperar al cron (rate limit en /p/*). */
  .post("/p/:id/sync", async (c) => {
    if (!linkIdSchema.safeParse(c.req.param("id")).success) throw new HTTPException(404);
    const lockKey = `indexer:lock:${c.env.NETWORK}`;
    if (await c.env.KV.get(lockKey)) return c.json({ queued: true }, 202);
    await c.env.KV.put(lockKey, "1", { expirationTtl: 60 });
    try {
      return c.json(await runIndexer(c.env));
    } finally {
      await c.env.KV.delete(lockKey);
    }
  })

  /** Solo en modo demo local: simula el pago para demos y E2E. */
  .post("/p/:id/demo-pay", async (c) => {
    if (!isDemo(c.env)) throw new HTTPException(404);
    const { link } = await loadLink(c, c.req.param("id"));
    if (link.status !== "open") throw new HTTPException(409, { message: "Este link ya no está abierto" });
    const { payer } = (await c.req.json().catch(() => ({}))) as { payer?: string };
    const payerAddr = stellarAddressSchema.safeParse(payer).success ? payer! : "GDEMOPAYERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
    const txHash = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const merchant = (await db(c.env).query.merchants.findFirst({ where: eq(s.merchants.id, link.merchantId) }))!;
    await applyEvent(c.env, { id: `demo-${link.id}`, ledger: 0, txHash }, {
      kind: "link_paid",
      linkId: link.id,
      merchant: merchant.wallet,
      payer: payerAddr,
      amount: BigInt(link.amountUnits),
    });
    return c.json({ txHash, fee: computeFee(BigInt(link.amountUnits), 90).toString() });
  })

  /** Solo testnet: envía MXNe/USDC de prueba a una wallet con trustline (una vez cada 10 min). */
  .post("/faucet", async (c) => {
    if (c.env.NETWORK !== "testnet" || !c.env.FAUCET_SECRET) throw new HTTPException(404);
    const body = (await c.req.json().catch(() => ({}))) as { wallet?: string; asset?: string };
    const wallet = stellarAddressSchema.parse(body.wallet);
    const asset: AssetCode = body.asset === "USDC" ? "USDC" : "MXNE";
    const key = `faucet:${wallet}:${asset}`;
    if (await c.env.KV.get(key)) throw new HTTPException(429, { message: "Ya recibiste saldo de prueba, intenta en unos minutos" });
    const d = getDeployment(c.env.NETWORK);
    const st = await getAssetStatus(d, wallet, asset);
    if (!st.trusted) throw new HTTPException(409, { message: `Primero habilita ${ASSETS[asset].label} en tu wallet` });
    const amount = toUnits(asset === "USDC" ? "100" : "2000");
    const txHash = await sendTestAsset(d, c.env.FAUCET_SECRET, wallet, asset, amount);
    await c.env.KV.put(key, "1", { expirationTtl: 600 });
    return c.json({ txHash, amountUnits: amount.toString() });
  });

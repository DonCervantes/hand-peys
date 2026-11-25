/**
 * Indexer de eventos on-chain → D1.
 * Cron (cada minuto) → getEvents → [Queue opcional] → applyEvent (idempotente por id de evento).
 */
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { xdr } from "@stellar/stellar-sdk";
import { computeFee } from "@hand-peys/shared";
import { decodeEvent, fetchEvents, type HandPeysEvent } from "@hand-peys/stellar";
import { db } from "../auth";
import * as s from "../db/schema";
import { chainEnabled, getDeployment, type Env, type SerializedEvent } from "../env";
import { syncMerchantKyc } from "./kyc";

const cursorKey = (env: Env) => `indexer:cursor:${env.NETWORK}`;

async function feeBps(env: Env): Promise<number> {
  const row = await db(env).query.settings.findFirst({ where: eq(s.settings.key, "fee_bps") });
  return Number(row?.value ?? 90);
}

export function serialize(e: { id: string; ledger: number; txHash: string; topic: xdr.ScVal[]; value: xdr.ScVal }): SerializedEvent {
  return { id: e.id, ledger: e.ledger, txHash: e.txHash, topic: e.topic.map((t) => t.toXDR("base64")), value: e.value.toXDR("base64") };
}

export function deserialize(e: SerializedEvent) {
  return {
    ...e,
    topic: e.topic.map((t) => xdr.ScVal.fromXDR(t, "base64")),
    value: xdr.ScVal.fromXDR(e.value, "base64"),
  };
}

/** Aplica un evento ya decodificado. Regresa false si ya se había procesado. */
export async function applyEvent(
  env: Env,
  meta: { id: string; ledger: number; txHash: string },
  ev: HandPeysEvent
): Promise<boolean> {
  const d = db(env);
  const seen = await d.query.chainEvents.findFirst({ where: eq(s.chainEvents.id, meta.id) });
  if (seen) return false;

  const now = Date.now();
  const mark = d.insert(s.chainEvents).values({ id: meta.id, ledger: meta.ledger, txHash: meta.txHash, kind: ev.kind, processedAt: now }).onConflictDoNothing();
  const effects: any[] = [];

  switch (ev.kind) {
    case "link_created":
      effects.push(d.update(s.links).set({ status: "open", createTxHash: meta.txHash }).where(and(eq(s.links.id, ev.linkId), eq(s.links.status, "pending"))));
      break;
    case "link_cancelled":
      effects.push(d.update(s.links).set({ status: "cancelled" }).where(eq(s.links.id, ev.linkId)));
      break;
    case "link_paid": {
      const link = await d.query.links.findFirst({ where: eq(s.links.id, ev.linkId) });
      if (!link) break;
      const direct = link.mode === "direct";
      const fee = direct ? computeFee(ev.amount, await feeBps(env)) : 0n;
      effects.push(d.update(s.links).set({ status: "paid" }).where(eq(s.links.id, ev.linkId)));
      effects.push(
        d.insert(s.payments)
          .values({
            linkId: ev.linkId,
            merchantId: link.merchantId,
            payer: ev.payer,
            amountUnits: ev.amount.toString(),
            feeUnits: fee.toString(),
            asset: link.asset,
            status: direct ? "settled" : "held",
            txHash: meta.txHash,
            ledger: meta.ledger,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
      );
      break;
    }
    case "released": {
      const p = await d.query.payments.findFirst({ where: eq(s.payments.linkId, ev.linkId) });
      if (!p) break;
      const fee = BigInt(p.amountUnits) - ev.value;
      effects.push(d.update(s.payments).set({ status: "released", feeUnits: fee.toString(), updatedAt: now }).where(eq(s.payments.linkId, ev.linkId)));
      break;
    }
    case "refunded":
      effects.push(d.update(s.payments).set({ status: "refunded", feeUnits: "0", updatedAt: now }).where(eq(s.payments.linkId, ev.linkId)));
      break;
    case "disputed":
      effects.push(d.update(s.payments).set({ status: "disputed", updatedAt: now }).where(eq(s.payments.linkId, ev.linkId)));
      break;
    case "resolved": {
      const p = await d.query.payments.findFirst({ where: eq(s.payments.linkId, ev.linkId) });
      if (!p) break;
      const toMerchant = ev.value === 1n;
      const fee = toMerchant ? computeFee(BigInt(p.amountUnits), await feeBps(env)) : 0n;
      effects.push(d.update(s.payments).set({ status: "resolved", feeUnits: fee.toString(), updatedAt: now }).where(eq(s.payments.linkId, ev.linkId)));
      break;
    }
    case "kyc_set":
      effects.push(
        d.update(s.merchants)
          .set({ kycLevel: ev.level, kycExpiresAt: Number(ev.expiresAt), kycStatus: ev.level >= 1 ? "approved" : "none", kycUpdatedAt: now })
          .where(eq(s.merchants.wallet, ev.address))
      );
      break;
    case "kyc_revoked":
      effects.push(
        d.update(s.merchants)
          .set({ kycLevel: 0, kycStatus: sql`CASE WHEN kyc_status = 'approved' THEN 'suspended' ELSE kyc_status END`, kycUpdatedAt: now })
          .where(eq(s.merchants.wallet, ev.address))
      );
      break;
    case "fee_charged":
      break; // ya contabilizado en link_paid
  }

  await d.batch([mark, ...effects] as [typeof mark, ...typeof effects]);
  return true;
}

export async function applySerialized(env: Env, e: SerializedEvent) {
  const raw = deserialize(e);
  const ev = decodeEvent(raw);
  if (!ev) return false;
  return applyEvent(env, raw, ev);
}

/** Tick del cron: lee eventos nuevos y los aplica (o los encola). */
export async function runIndexer(env: Env) {
  const d = getDeployment(env.NETWORK);
  if (!chainEnabled(env)) return { skipped: "contratos no activos (no desplegados o DEMO_MODE)" };
  const cursor = (await env.KV.get(cursorKey(env))) ?? undefined;
  const { events, cursor: next } = await fetchEvents(d, { cursor });
  let applied = 0;
  for (const e of events) {
    const ser = serialize(e);
    if (env.EVENTS_QUEUE) await env.EVENTS_QUEUE.send(ser);
    else if (await applySerialized(env, ser)) applied++;
  }
  if (next) await env.KV.put(cursorKey(env), next);
  return { fetched: events.length, applied };
}

/** Marca como expirados los links vencidos. */
export async function expireLinks(env: Env) {
  const now = Math.floor(Date.now() / 1000);
  await db(env)
    .update(s.links)
    .set({ status: "expired" })
    .where(and(eq(s.links.status, "open"), gt(s.links.expiresAt, 0), lt(s.links.expiresAt, now)));
}

/** Cada 5 minutos: reconcilia KYC pendientes contra Pollar. */
export async function reconcileKyc(env: Env) {
  const pending = await db(env).query.merchants.findMany({ where: eq(s.merchants.kycStatus, "pending"), limit: 25 });
  for (const m of pending) {
    try {
      await syncMerchantKyc(env, m.id);
    } catch (err) {
      console.error("reconcileKyc", m.id, err);
    }
  }
}

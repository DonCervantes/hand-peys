import { eq } from "drizzle-orm";
import { revokeKycServer, setKycStatusServer } from "@hand-peys/stellar";
import { db } from "../auth";
import * as s from "../db/schema";
import { chainEnabled, getDeployment, type Env } from "../env";
import { getPollarKyc, sha256 } from "../pollar";

const YEAR = 365 * 24 * 3600;
type Merchant = typeof s.merchants.$inferSelect;

/** Escribe el KYC on-chain con la cuenta de cumplimiento (si hay contratos y llave). */
async function writeOnChain(env: Env, m: Merchant, level: 0 | 1 | 2, ref: string) {
  const d = getDeployment(env.NETWORK);
  if (!chainEnabled(env) || !env.COMPLIANCE_SIGNER_SECRET) return { txHash: null, expiresAt: Math.floor(Date.now() / 1000) + YEAR };
  const expiresAt = Math.floor(Date.now() / 1000) + YEAR;
  const txHash = await setKycStatusServer(d, env.COMPLIANCE_SIGNER_SECRET, {
    merchant: m.wallet,
    level,
    expiresAt,
    refHash: await sha256(ref),
  });
  return { txHash, expiresAt };
}

export async function approveMerchant(env: Env, m: Merchant, level: 1 | 2, ref: string, reviewer: string | null) {
  const { txHash, expiresAt } = await writeOnChain(env, m, level, ref);
  const now = Date.now();
  await db(env).batch([
    db(env)
      .update(s.merchants)
      .set({ kycStatus: "approved", kycLevel: level, kycRef: ref, kycExpiresAt: expiresAt, kycTxHash: txHash, kycUpdatedAt: now })
      .where(eq(s.merchants.id, m.id)),
    db(env).insert(s.kycReviews).values({
      id: crypto.randomUUID(),
      merchantId: m.id,
      reviewerUserId: reviewer,
      decision: "approve",
      level,
      createdAt: now,
    }),
  ]);
  return { txHash };
}

export async function rejectOrSuspend(
  env: Env,
  m: Merchant,
  decision: "reject" | "suspend",
  reviewer: string | null,
  reason?: string
) {
  let txHash: string | null = null;
  const d = getDeployment(env.NETWORK);
  if (m.kycStatus === "approved" && chainEnabled(env) && env.COMPLIANCE_SIGNER_SECRET) {
    txHash = await revokeKycServer(d, env.COMPLIANCE_SIGNER_SECRET, m.wallet);
  }
  const now = Date.now();
  await db(env).batch([
    db(env)
      .update(s.merchants)
      .set({ kycStatus: decision === "reject" ? "rejected" : "suspended", kycLevel: 0, kycTxHash: txHash, kycUpdatedAt: now })
      .where(eq(s.merchants.id, m.id)),
    db(env).insert(s.kycReviews).values({
      id: crypto.randomUUID(),
      merchantId: m.id,
      reviewerUserId: reviewer,
      decision,
      reason: reason ?? null,
      createdAt: now,
    }),
  ]);
  return { txHash };
}

/** Vuelve a consultar el KYC en Pollar (servidor) y actualiza D1 + on-chain. */
export async function syncMerchantKyc(env: Env, merchantId: string) {
  const m = await db(env).query.merchants.findFirst({ where: eq(s.merchants.id, merchantId) });
  if (!m) throw new Error("Comercio no encontrado");
  if (m.kycStatus === "suspended") return { status: m.kycStatus };
  const owner = await db(env).query.users.findFirst({ where: eq(s.users.id, m.ownerUserId) });
  if (!owner) throw new Error("Dueño no encontrado");

  const kyc = await getPollarKyc(env, owner.pollarId);
  if (kyc.state === "approved" && m.kycStatus !== "approved") {
    const { txHash } = await approveMerchant(env, m, kyc.level === 2 ? 2 : 1, kyc.reference ?? owner.pollarId, null);
    return { status: "approved" as const, level: kyc.level, txHash };
  }
  if (kyc.state === "rejected" && m.kycStatus !== "rejected") {
    await rejectOrSuspend(env, m, "reject", null, "Rechazado por el proveedor de identidad");
    return { status: "rejected" as const };
  }
  if (kyc.state === "pending" && m.kycStatus === "none") {
    await db(env).update(s.merchants).set({ kycStatus: "pending", kycUpdatedAt: Date.now() }).where(eq(s.merchants.id, m.id));
    return { status: "pending" as const };
  }
  return { status: m.kycStatus, level: m.kycLevel };
}

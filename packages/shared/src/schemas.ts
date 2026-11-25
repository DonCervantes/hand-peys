import { z } from "zod";

export const assetSchema = z.enum(["MXNE", "USDC"]);
export const linkModeSchema = z.enum(["direct", "escrow"]);

/** Monto decimal como string, > 0, máx. 7 decimales y tope de 9,999,999. */
export const amountSchema = z
  .string()
  .regex(/^\d{1,7}(\.\d{1,7})?$/, "Monto inválido")
  .refine((v) => Number(v) > 0, "El monto debe ser mayor a 0");

export const createLinkSchema = z.object({
  amount: amountSchema,
  asset: assetSchema.default("MXNE"),
  description: z.string().trim().min(1, "Agrega una descripción").max(140),
  mode: linkModeSchema.default("direct"),
  expiresInHours: z.number().int().min(0).max(24 * 90).default(0),
});
export type CreateLinkInput = z.infer<typeof createLinkSchema>;

export const createMerchantSchema = z.object({
  name: z.string().trim().min(2).max(80),
  category: z.enum(["changarro", "freelance", "pyme"]).default("changarro"),
  city: z.string().trim().max(80).optional(),
});
export type CreateMerchantInput = z.infer<typeof createMerchantSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.literal("comercio_cajero"),
});

export const kycDecisionSchema = z.object({
  decision: z.enum(["approve", "reject", "suspend"]),
  level: z.union([z.literal(1), z.literal(2)]).default(1),
  reason: z.string().max(280).optional(),
});

export const stellarAddressSchema = z.string().regex(/^[GC][A-Z2-7]{55}$/, "Dirección Stellar inválida");

/** Ids de link: 16 bytes en hex (BytesN<16> en el contrato). */
export const linkIdSchema = z.string().regex(/^[0-9a-f]{32}$/);

export const submittedTxSchema = z.object({
  txHash: z.string().regex(/^[0-9a-f]{64}$/),
});

export type LinkStatus = "pending" | "open" | "paid" | "cancelled" | "expired";
export type PaymentStatus = "settled" | "held" | "released" | "refunded" | "disputed" | "resolved";
export type KycStatus = "none" | "pending" | "approved" | "rejected" | "suspended";

import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  pollarId: text("pollar_id").notNull().unique(),
  email: text("email"),
  wallet: text("wallet").unique(),
  platformRole: text("platform_role", { enum: ["super_admin", "cumplimiento"] }),
  createdAt: integer("created_at").notNull(),
});

export const merchants = sqliteTable("merchants", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("changarro"),
  city: text("city"),
  wallet: text("wallet").notNull(),
  kycStatus: text("kyc_status", { enum: ["none", "pending", "approved", "rejected", "suspended"] })
    .notNull()
    .default("none"),
  kycLevel: integer("kyc_level").notNull().default(0),
  kycRef: text("kyc_ref"),
  kycExpiresAt: integer("kyc_expires_at"),
  kycTxHash: text("kyc_tx_hash"),
  kycUpdatedAt: integer("kyc_updated_at"),
  createdAt: integer("created_at").notNull(),
});

export const memberships = sqliteTable(
  "memberships",
  {
    userId: text("user_id").notNull(),
    merchantId: text("merchant_id").notNull(),
    role: text("role", { enum: ["comercio_owner", "comercio_cajero"] }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.merchantId] })]
);

export const invitations = sqliteTable("invitations", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  acceptedAt: integer("accepted_at"),
  createdAt: integer("created_at").notNull(),
});

export const links = sqliteTable("links", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  createdBy: text("created_by").notNull(),
  amountUnits: text("amount_units").notNull(),
  asset: text("asset", { enum: ["MXNE", "USDC", "XLM"] }).notNull(),
  description: text("description").notNull(),
  mode: text("mode", { enum: ["direct", "escrow"] }).notNull(),
  expiresAt: integer("expires_at").notNull().default(0),
  status: text("status", { enum: ["pending", "open", "paid", "cancelled", "expired"] }).notNull().default("pending"),
  createTxHash: text("create_tx_hash"),
  createdAt: integer("created_at").notNull(),
});

export const payments = sqliteTable("payments", {
  linkId: text("link_id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  payer: text("payer").notNull(),
  amountUnits: text("amount_units").notNull(),
  feeUnits: text("fee_units").notNull().default("0"),
  asset: text("asset").notNull(),
  status: text("status", { enum: ["settled", "held", "released", "refunded", "disputed", "resolved"] }).notNull(),
  txHash: text("tx_hash").notNull(),
  ledger: integer("ledger").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const chainEvents = sqliteTable("chain_events", {
  id: text("id").primaryKey(),
  ledger: integer("ledger").notNull(),
  txHash: text("tx_hash").notNull(),
  kind: text("kind").notNull(),
  processedAt: integer("processed_at").notNull(),
});

export const kycReviews = sqliteTable("kyc_reviews", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  reviewerUserId: text("reviewer_user_id"),
  decision: text("decision").notNull(),
  level: integer("level"),
  reason: text("reason"),
  createdAt: integer("created_at").notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

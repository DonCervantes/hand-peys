-- Hand Peys: esquema inicial (D1 / SQLite)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  pollar_id TEXT NOT NULL UNIQUE,
  email TEXT,
  wallet TEXT UNIQUE,
  platform_role TEXT CHECK (platform_role IN ('super_admin', 'cumplimiento')),
  created_at INTEGER NOT NULL
);

CREATE TABLE merchants (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'changarro',
  city TEXT,
  wallet TEXT NOT NULL,
  kyc_status TEXT NOT NULL DEFAULT 'none',
  kyc_level INTEGER NOT NULL DEFAULT 0,
  kyc_ref TEXT,
  kyc_expires_at INTEGER,
  kyc_tx_hash TEXT,
  kyc_updated_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX merchants_kyc_status ON merchants(kyc_status);

CREATE TABLE memberships (
  user_id TEXT NOT NULL REFERENCES users(id),
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  role TEXT NOT NULL CHECK (role IN ('comercio_owner', 'comercio_cajero')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, merchant_id)
);

CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  accepted_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX invitations_email ON invitations(email);

CREATE TABLE links (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  amount_units TEXT NOT NULL,
  asset TEXT NOT NULL CHECK (asset IN ('MXNE', 'USDC')),
  description TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('direct', 'escrow')),
  expires_at INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  create_tx_hash TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX links_merchant ON links(merchant_id, created_at);

CREATE TABLE payments (
  link_id TEXT PRIMARY KEY REFERENCES links(id),
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  payer TEXT NOT NULL,
  amount_units TEXT NOT NULL,
  fee_units TEXT NOT NULL DEFAULT '0',
  asset TEXT NOT NULL,
  status TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  ledger INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX payments_merchant ON payments(merchant_id, created_at);

-- Idempotencia del indexer: cada evento on-chain se aplica una sola vez.
CREATE TABLE chain_events (
  id TEXT PRIMARY KEY,
  ledger INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  kind TEXT NOT NULL,
  processed_at INTEGER NOT NULL
);

CREATE TABLE kyc_reviews (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  reviewer_user_id TEXT,
  decision TEXT NOT NULL,
  level INTEGER,
  reason TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES ('fee_bps', '90');

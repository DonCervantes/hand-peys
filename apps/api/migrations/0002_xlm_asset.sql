-- Permite cobrar en XLM nativo (mainnet). SQLite no puede alterar un CHECK: se recrea la tabla.
PRAGMA defer_foreign_keys = true;

CREATE TABLE links_new (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  amount_units TEXT NOT NULL,
  asset TEXT NOT NULL CHECK (asset IN ('MXNE', 'USDC', 'XLM')),
  description TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('direct', 'escrow')),
  expires_at INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  create_tx_hash TEXT,
  created_at INTEGER NOT NULL
);
INSERT INTO links_new SELECT * FROM links;
DROP TABLE links;
ALTER TABLE links_new RENAME TO links;
CREATE INDEX links_merchant ON links(merchant_id, created_at);

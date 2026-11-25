/**
 * Shim mínimo de D1 y KV sobre `node:sqlite` para probar la API en Vitest
 * sin Miniflare. Aplica las migraciones reales de /migrations.
 */
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Env } from "../src/env";

class Stmt {
  private params: unknown[] = [];
  constructor(private db: DatabaseSync, private sql: string) {}
  bind(...p: unknown[]) {
    this.params = p.map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : v));
    return this;
  }
  private st() {
    return this.db.prepare(this.sql);
  }
  async all() {
    return { results: this.st().all(...(this.params as any[])), success: true, meta: {} };
  }
  async first(col?: string) {
    const row = this.st().get(...(this.params as any[])) as Record<string, unknown> | undefined;
    return row ? (col ? row[col] : row) : null;
  }
  async raw() {
    const st = this.st();
    (st as any).setReturnArrays?.(true);
    const rows = st.all(...(this.params as any[]));
    return rows.map((r: any) => (Array.isArray(r) ? r : Object.values(r)));
  }
  async run() {
    const r = this.st().run(...(this.params as any[]));
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

export function makeD1() {
  const db = new DatabaseSync(":memory:");
  const dir = join(__dirname, "..", "migrations");
  for (const f of readdirSync(dir).sort()) db.exec(readFileSync(join(dir, f), "utf8"));
  const d1 = {
    prepare: (sql: string) => new Stmt(db, sql),
    async batch(stmts: any[]) {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) out.push(await s.all());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    async exec(sql: string) {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
  };
  return { d1: d1 as unknown as D1Database, raw: db };
}

export function makeKV(): KVNamespace {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => void m.set(k, v),
    delete: async (k: string) => void m.delete(k),
  } as unknown as KVNamespace;
}

export function makeEnv(over: Partial<Env> = {}): Env & { raw: DatabaseSync } {
  const { d1, raw } = makeD1();
  return {
    DB: d1,
    KV: makeKV(),
    ENVIRONMENT: "local",
    DEMO_MODE: "true",
    NETWORK: "testnet",
    APP_URL: "http://localhost:5173",
    POLLAR_API_URL: "http://pollar.invalid",
    SESSION_SECRET: "test-secret-0123456789",
    KYC_LEVEL1_MONTHLY_LIMIT_MXN: "50000",
    raw,
    ...over,
  };
}

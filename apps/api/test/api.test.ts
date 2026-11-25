import { describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { app } from "../src/app";
import { applyEvent } from "../src/services/indexer";
import { makeEnv } from "./shim";

type Env = ReturnType<typeof makeEnv>;

async function call(env: Env, method: string, path: string, body?: unknown, token?: string) {
  const res = await app.request(
    `/api${path}`,
    {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    },
    env
  );
  const text = await res.text();
  let json: any = text;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json };
}

async function login(env: Env, email = "lupe@example.com") {
  const wallet = Keypair.random().publicKey();
  const r = await call(env, "POST", "/auth/session", { pollarToken: `dev:${wallet}:${email}` });
  expect(r.status).toBe(200);
  return { token: r.json.token as string, wallet, userId: r.json.user.id as string };
}

async function merchantWithKyc(env: Env) {
  const owner = await login(env);
  const m = await call(env, "POST", "/merchants", { name: "Tamales Doña Lupe", city: "Coyoacán" }, owner.token);
  expect(m.status).toBe(201);
  const k = await call(env, "POST", `/merchants/${m.json.id}/kyc/sync`, undefined, owner.token);
  expect(k.json.status).toBe("approved");
  return { owner, mid: m.json.id as string };
}

describe("auth", () => {
  it("rechaza sin sesión", async () => {
    const env = makeEnv();
    expect((await call(env, "GET", "/auth/me")).status).toBe(401);
  });

  it("rechaza tokens de Pollar inválidos", async () => {
    const env = makeEnv();
    expect((await call(env, "POST", "/auth/session", { pollarToken: "basura" })).status).toBe(401);
  });

  it("crea usuario y regresa /me", async () => {
    const env = makeEnv();
    const { token, wallet } = await login(env);
    const me = await call(env, "GET", "/auth/me", undefined, token);
    expect(me.json.user.wallet).toBe(wallet);
    expect(me.json.merchants).toEqual([]);
  });

  it("asigna rol de plataforma por wallet", async () => {
    const admin = Keypair.random().publicKey();
    const env = makeEnv({ SUPER_ADMIN_WALLETS: admin });
    const r = await call(env, "POST", "/auth/session", { pollarToken: `dev:${admin}:a@hp.mx` });
    const me = await call(env, "GET", "/auth/me", undefined, r.json.token);
    expect(me.json.user.platformRole).toBe("super_admin");
  });
});

describe("links", () => {
  it("no deja crear links sin KYC", async () => {
    const env = makeEnv();
    const owner = await login(env);
    const m = await call(env, "POST", "/merchants", { name: "Diseño Beto" }, owner.token);
    const r = await call(env, "POST", `/merchants/${m.json.id}/links`, { amount: "350", description: "Logo" }, owner.token);
    expect(r.status).toBe(403);
  });

  it("valida montos", async () => {
    const env = makeEnv();
    const { owner, mid } = await merchantWithKyc(env);
    const r = await call(env, "POST", `/merchants/${mid}/links`, { amount: "0", description: "x" }, owner.token);
    expect(r.status).toBe(400);
  });

  it("flujo demo completo: crear → checkout → pagar → cobro → comprobante", async () => {
    const env = makeEnv();
    const { owner, mid } = await merchantWithKyc(env);
    const link = await call(env, "POST", `/merchants/${mid}/links`, { amount: "350", description: "10 tamales" }, owner.token);
    expect(link.status).toBe(201);
    expect(link.json.status).toBe("open");

    const pub = await call(env, "GET", `/p/${link.json.id}`);
    expect(pub.json).toMatchObject({ description: "10 tamales", amountUnits: "3500000000", status: "open" });
    expect(pub.json.merchant.verified).toBe(true);

    const pay = await call(env, "POST", `/p/${link.json.id}/demo-pay`, {});
    expect(pay.status).toBe(200);
    expect((await call(env, "POST", `/p/${link.json.id}/demo-pay`, {})).status).toBe(409);

    const payments = await call(env, "GET", `/merchants/${mid}/payments`, undefined, owner.token);
    expect(payments.json).toHaveLength(1);
    expect(payments.json[0]).toMatchObject({ status: "settled", feeUnits: "31500000", description: "10 tamales" });

    const dash = await call(env, "GET", `/merchants/${mid}`, undefined, owner.token);
    expect(dash.json.totals[0]).toMatchObject({ asset: "MXNE", count: 1 });

    const receipt = await call(env, "GET", `/p/${link.json.id}/receipt`);
    expect(receipt.status).toBe(200);
    expect(String(receipt.json)).toContain("$350.00 MXN");
  });

  it("links pending no son públicos", async () => {
    const env = makeEnv();
    expect((await call(env, "GET", "/p/00112233445566778899aabbccddeeff")).status).toBe(404);
    expect((await call(env, "GET", "/p/nope")).status).toBe(404);
  });
});

describe("roles", () => {
  it("cajero crea links pero no ve colaboradores", async () => {
    const env = makeEnv();
    const { owner, mid } = await merchantWithKyc(env);
    await call(env, "POST", `/merchants/${mid}/members`, { email: "cajero@example.com", role: "comercio_cajero" }, owner.token);
    const cajero = await login(env, "cajero@example.com");
    const me = await call(env, "GET", "/auth/me", undefined, cajero.token);
    expect(me.json.merchants[0].role).toBe("comercio_cajero");
    expect((await call(env, "POST", `/merchants/${mid}/links`, { amount: "50", description: "Atole" }, cajero.token)).status).toBe(201);
    expect((await call(env, "GET", `/merchants/${mid}/members`, undefined, cajero.token)).status).toBe(403);
    expect((await call(env, "POST", `/merchants/${mid}/kyc/sync`, undefined, cajero.token)).status).toBe(403);
  });

  it("un extraño no ve el comercio", async () => {
    const env = makeEnv();
    const { mid } = await merchantWithKyc(env);
    const other = await login(env, "otro@example.com");
    expect((await call(env, "GET", `/merchants/${mid}`, undefined, other.token)).status).toBe(403);
  });

  it("solo plataforma entra a /admin", async () => {
    const env = makeEnv();
    const u = await login(env);
    expect((await call(env, "GET", "/admin/kyc", undefined, u.token)).status).toBe(403);
  });

  it("cumplimiento suspende un comercio y ya no puede cobrar", async () => {
    const comp = Keypair.random().publicKey();
    const env = makeEnv({ COMPLIANCE_WALLETS: comp });
    const { owner, mid } = await merchantWithKyc(env);
    const c = await call(env, "POST", "/auth/session", { pollarToken: `dev:${comp}:c@hp.mx` });
    const r = await call(env, "POST", `/admin/kyc/${mid}`, { decision: "suspend", reason: "Revisión" }, c.json.token);
    expect(r.status).toBe(200);
    expect((await call(env, "POST", `/merchants/${mid}/links`, { amount: "1", description: "x" }, owner.token)).status).toBe(403);
    expect((await call(env, "GET", "/admin/metrics", undefined, c.json.token)).status).toBe(403);
  });
});

describe("indexer", () => {
  it("es idempotente y sigue el ciclo del escrow", async () => {
    const env = makeEnv();
    const { owner, mid } = await merchantWithKyc(env);
    const link = await call(env, "POST", `/merchants/${mid}/links`, { amount: "100", description: "Pastel", mode: "escrow" }, owner.token);
    const id = link.json.id;
    const meta = (n: string) => ({ id: n, ledger: 1, txHash: "ab".repeat(32) });
    const paid = { kind: "link_paid" as const, linkId: id, merchant: owner.wallet, payer: Keypair.random().publicKey(), amount: 1_000_000_000n };

    expect(await applyEvent(env, meta("e1"), paid)).toBe(true);
    expect(await applyEvent(env, meta("e1"), paid)).toBe(false);
    let p = (await call(env, "GET", `/merchants/${mid}/payments`, undefined, owner.token)).json[0];
    expect(p).toMatchObject({ status: "held", feeUnits: "0" });

    await applyEvent(env, meta("e2"), { kind: "released", linkId: id, value: 991_000_000n });
    p = (await call(env, "GET", `/merchants/${mid}/payments`, undefined, owner.token)).json[0];
    expect(p).toMatchObject({ status: "released", feeUnits: "9000000" });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { getAssetStatus } from "../src";

const issuer = Keypair.random().publicKey();
const user = Keypair.random().publicKey();
const d = {
  horizonUrl: "https://horizon.invalid",
  tokens: { MXNE: { contractId: "C", asset: `MXNe:${issuer}` }, USDC: { contractId: "C", asset: `USDC:${issuer}` } },
};
const horizon = (status: number, body?: unknown) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body ? JSON.stringify(body) : null, { status }));

afterEach(() => vi.restoreAllMocks());

describe("getAssetStatus", () => {
  it("cuenta inexistente", async () => {
    horizon(404);
    expect(await getAssetStatus(d, user, "MXNE")).toEqual({ exists: false, trusted: false, balance: 0n });
  });

  it("sin trustline", async () => {
    horizon(200, { balances: [{ asset_type: "native", balance: "10000.0000000" }] });
    expect(await getAssetStatus(d, user, "MXNE")).toEqual({ exists: true, trusted: false, balance: 0n });
  });

  it("convierte el saldo a unidades de 7 decimales", async () => {
    horizon(200, { balances: [{ asset_code: "MXNe", asset_issuer: issuer, balance: "1650.5000000" }] });
    expect(await getAssetStatus(d, user, "MXNE")).toEqual({ exists: true, trusted: true, balance: 16_505_000_000n });
  });

  it("ignora el mismo código de otro emisor", async () => {
    horizon(200, { balances: [{ asset_code: "MXNe", asset_issuer: Keypair.random().publicKey(), balance: "99.0000000" }] });
    expect((await getAssetStatus(d, user, "MXNE")).trusted).toBe(false);
  });
});

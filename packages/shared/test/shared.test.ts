import { describe, expect, it } from "vitest";
import { can, computeFee, createLinkSchema, formatMoney, fromUnits, newLinkId, toUnits } from "../src";

describe("money", () => {
  it("convierte a unidades de 7 decimales", () => {
    expect(toUnits("350")).toBe(3_500_000_000n);
    expect(toUnits("0.0000001")).toBe(1n);
    expect(toUnits("10.50")).toBe(105_000_000n);
    expect(() => toUnits("1.00000001")).toThrow();
    expect(() => toUnits("-1")).toThrow();
  });
  it("ida y vuelta", () => {
    expect(fromUnits(toUnits("123.4567"))).toBe("123.4567");
    expect(fromUnits(3_500_000_000n)).toBe("350");
  });
  it("comisión igual que el contrato", () => {
    expect(computeFee(3_500_000_000n, 90)).toBe(31_500_000n);
    expect(computeFee(111n, 90)).toBe(0n);
  });
  it("formatea en es-MX", () => {
    expect(formatMoney(toUnits("1350"), "MXNE")).toBe("$1,350.00 MXN");
    expect(formatMoney(toUnits("1"), "USDC")).toBe("US$1.00 USD");
  });
});

describe("roles", () => {
  it("cajero crea links pero no reembolsa ni retira", () => {
    expect(can("comercio_cajero", "links:create")).toBe(true);
    expect(can("comercio_cajero", "payments:refund")).toBe(false);
    expect(can("comercio_cajero", "funds:withdraw")).toBe(false);
  });
  it("cumplimiento revisa KYC y no configura comisión", () => {
    expect(can("cumplimiento", "kyc:review")).toBe(true);
    expect(can("cumplimiento", "config:fee")).toBe(false);
  });
});

describe("schemas", () => {
  it("valida links", () => {
    expect(createLinkSchema.parse({ amount: "350", description: "10 tamales" })).toMatchObject({
      asset: "MXNE",
      mode: "direct",
    });
    expect(createLinkSchema.safeParse({ amount: "0", description: "x" }).success).toBe(false);
    expect(createLinkSchema.safeParse({ amount: "1", description: "" }).success).toBe(false);
  });
  it("ids de 16 bytes", () => {
    expect(newLinkId()).toMatch(/^[0-9a-f]{32}$/);
  });
});

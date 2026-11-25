import { describe, expect, it } from "vitest";
import { Address, Keypair, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { decodeEvent, linkIdToScVal } from "../src";

const sym = (s: string) => xdr.ScVal.scvSymbol(s);
const merchant = Keypair.random().publicKey();
const payer = Keypair.random().publicKey();
const id = "00112233445566778899aabbccddeeff";

describe("decodeEvent", () => {
  it("link_paid", () => {
    const ev = decodeEvent({
      topic: [sym("link_paid"), linkIdToScVal(id), new Address(merchant).toScVal()],
      value: xdr.ScVal.scvVec([new Address(payer).toScVal(), nativeToScVal(3_500_000_000n, { type: "i128" })]),
    });
    expect(ev).toEqual({ kind: "link_paid", linkId: id, merchant, payer, amount: 3_500_000_000n });
  });

  it("link_created", () => {
    const ev = decodeEvent({
      topic: [sym("link_created"), linkIdToScVal(id), new Address(merchant).toScVal()],
      value: xdr.ScVal.scvVec([nativeToScVal(10n, { type: "i128" }), nativeToScVal(1, { type: "u32" })]),
    });
    expect(ev).toMatchObject({ kind: "link_created", linkId: id, mode: 1, amount: 10n });
  });

  it("escrow released", () => {
    const ev = decodeEvent({ topic: [sym("released"), linkIdToScVal(id)], value: nativeToScVal(99n, { type: "i128" }) });
    expect(ev).toEqual({ kind: "released", linkId: id, value: 99n });
  });

  it("ignora eventos ajenos", () => {
    expect(decodeEvent({ topic: [sym("transfer")], value: xdr.ScVal.scvVoid() })).toBeNull();
  });
});

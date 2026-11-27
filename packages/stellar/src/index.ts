/**
 * Helpers de Stellar/Soroban para Hand Peys.
 * - Construye transacciones de los contratos (el front las firma con Pollar).
 * - Firma `kyc_registry.set_status` del lado del servidor (cuenta cumplimiento).
 * - Decodifica eventos para el indexer.
 */
import {
  Address,
  Asset,
  BASE_FEE,
  Operation,
  Contract,
  Keypair,
  nativeToScVal,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
  type Transaction,
} from "@stellar/stellar-sdk";
import type { AssetCode } from "@hand-peys/shared";

export type NetworkName = "testnet" | "mainnet";

export interface Deployment {
  network: NetworkName;
  rpcUrl: string;
  horizonUrl: string;
  networkPassphrase: string;
  explorer: string;
  contracts: { kyc_registry: string; fee_splitter: string; payment_link: string; escrow: string };
  /** asset = "CODE:ISSUER" del activo clásico detrás del SAC, o "native" para XLM. Cada red tiene sus activos. */
  tokens: Partial<Record<AssetCode, { contractId: string; asset: string }>>;
}

export const MODE = { direct: 0, escrow: 1 } as const;

const hexToBytes = (hex: string) => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};
const bytesToHex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

export const linkIdToScVal = (id: string) => xdr.ScVal.scvBytes(hexToBytes(id) as unknown as Buffer);
const addr = (a: string) => new Address(a).toScVal();
const i128 = (v: bigint) => nativeToScVal(v, { type: "i128" });
const u32 = (v: number) => nativeToScVal(v, { type: "u32" });
const u64 = (v: bigint | number) => nativeToScVal(BigInt(v), { type: "u64" });

export function server(d: Pick<Deployment, "rpcUrl">) {
  return new rpc.Server(d.rpcUrl, { allowHttp: d.rpcUrl.startsWith("http://") });
}

/** Construye y simula (prepare) una invocación; regresa la tx lista para firmar. */
export async function buildInvoke(
  d: Deployment,
  sourceAccount: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[]
): Promise<Transaction> {
  const s = server(d);
  const account = await s.getAccount(sourceAccount);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: d.networkPassphrase })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(120)
    .build();
  return (await s.prepareTransaction(tx)) as Transaction;
}

/** Token de un activo en esta red (error claro si la red no lo tiene). */
export function tokenOf(d: Pick<Deployment, "tokens">, code: AssetCode) {
  const t = d.tokens[code];
  if (!t) throw new Error(`Este activo (${code}) no está disponible en esta red`);
  return t;
}

export function buildCreateLink(
  d: Deployment,
  p: { merchant: string; id: string; asset: AssetCode; amount: bigint; mode: keyof typeof MODE; expiresAt: number }
) {
  return buildInvoke(d, p.merchant, d.contracts.payment_link, "create_link", [
    addr(p.merchant),
    linkIdToScVal(p.id),
    addr(tokenOf(d, p.asset).contractId),
    i128(p.amount),
    u32(MODE[p.mode]),
    u64(p.expiresAt),
  ]);
}

export const buildPay = (d: Deployment, p: { id: string; payer: string }) =>
  buildInvoke(d, p.payer, d.contracts.payment_link, "pay", [linkIdToScVal(p.id), addr(p.payer)]);

export const buildCancel = (d: Deployment, p: { id: string; merchant: string }) =>
  buildInvoke(d, p.merchant, d.contracts.payment_link, "cancel", [linkIdToScVal(p.id)]);

export type EscrowAction = "confirm" | "refund" | "dispute" | "claim";
export const buildEscrow = (d: Deployment, action: EscrowAction, p: { id: string; signer: string }) =>
  buildInvoke(d, p.signer, d.contracts.escrow, action, [linkIdToScVal(p.id)]);

export const buildResolve = (d: Deployment, p: { id: string; signer: string; toMerchant: boolean }) =>
  buildInvoke(d, p.signer, d.contracts.escrow, "resolve", [linkIdToScVal(p.id), xdr.ScVal.scvBool(p.toMerchant)]);

/** Envía una tx firmada (XDR) y espera el resultado. */
export async function submitSigned(d: Deployment, signedXdr: string) {
  const s = server(d);
  const tx = TransactionBuilder.fromXDR(signedXdr, d.networkPassphrase);
  const sent = await s.sendTransaction(tx);
  if (sent.status === "ERROR") throw new Error(`Error al enviar: ${JSON.stringify(sent.errorResult)}`);
  const res = await s.pollTransaction(sent.hash, { attempts: 30 });
  if (res.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error(`Tx ${sent.hash} falló: ${res.status}`);
  return sent.hash;
}

/** Firma y envía `kyc_registry.set_status` con la llave de cumplimiento (solo servidor). */
export async function setKycStatusServer(
  d: Deployment,
  complianceSecret: string,
  p: { merchant: string; level: 0 | 1 | 2; expiresAt: number; refHash: Uint8Array }
): Promise<string> {
  const kp = Keypair.fromSecret(complianceSecret);
  const tx = await buildInvoke(d, kp.publicKey(), d.contracts.kyc_registry, "set_status", [
    addr(p.merchant),
    u32(p.level),
    u64(p.expiresAt),
    xdr.ScVal.scvBytes(p.refHash as unknown as Buffer),
  ]);
  tx.sign(kp);
  return submitSigned(d, tx.toXDR());
}

export async function revokeKycServer(d: Deployment, complianceSecret: string, merchant: string) {
  const kp = Keypair.fromSecret(complianceSecret);
  const tx = await buildInvoke(d, kp.publicKey(), d.contracts.kyc_registry, "revoke", [addr(merchant)]);
  tx.sign(kp);
  return submitSigned(d, tx.toXDR());
}

// ---------------- Activos clásicos (trustlines) ----------------

const classicAsset = (d: Pick<Deployment, "tokens">, code: AssetCode) => {
  const { asset } = tokenOf(d, code);
  if (asset === "native") return Asset.native();
  const [c, issuer] = asset.split(":");
  return new Asset(c!, issuer!);
};

export interface AssetStatus {
  /** La cuenta existe en la red (tiene XLM). */
  exists: boolean;
  /** Tiene trustline al activo (o es su emisor). */
  trusted: boolean;
  /** Saldo en unidades (7 decimales). */
  balance: bigint;
}

/** Estado de una cuenta para un activo: existe, tiene trustline y saldo (vía Horizon). */
export async function getAssetStatus(d: Pick<Deployment, "horizonUrl" | "tokens">, account: string, code: AssetCode): Promise<AssetStatus> {
  const res = await fetch(`${d.horizonUrl}/accounts/${account}`);
  if (res.status === 404) return { exists: false, trusted: false, balance: 0n };
  if (!res.ok) throw new Error(`Horizon ${res.status}`);
  const acc = (await res.json()) as {
    subentry_count?: number;
    balances: { asset_type: string; asset_code?: string; asset_issuer?: string; balance: string; selling_liabilities?: string }[];
  };
  const a = classicAsset(d, code);
  if (a.isNative()) {
    // XLM no necesita trustline; el saldo disponible descuenta la reserva mínima de la cuenta.
    const nat = acc.balances.find((b) => b.asset_type === "native");
    const reserve = toStroops(String((2 + (acc.subentry_count ?? 0)) * 0.5));
    const free = toStroops(nat?.balance ?? "0") - reserve - toStroops(nat?.selling_liabilities ?? "0");
    return { exists: true, trusted: true, balance: free > 0n ? free : 0n };
  }
  if (a.getIssuer() === account) return { exists: true, trusted: true, balance: 0n };
  const line = acc.balances.find((b) => b.asset_code === a.getCode() && b.asset_issuer === a.getIssuer());
  if (!line) return { exists: true, trusted: false, balance: 0n };
  return { exists: true, trusted: true, balance: toStroops(line.balance) };
}

/** "1650.5000000" → 16505000000n */
function toStroops(v: string): bigint {
  const [int, frac = ""] = v.split(".");
  return BigInt(int || "0") * 10_000_000n + BigInt(frac.padEnd(7, "0").slice(0, 7) || "0");
}

/** Tx clásica que agrega trustlines a los activos indicados (la firma la wallet). */
export async function buildChangeTrust(d: Deployment, account: string, codes: AssetCode[]): Promise<Transaction> {
  const acc = await server(d).getAccount(account);
  const b = new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: d.networkPassphrase });
  for (const c of codes) {
    const asset = classicAsset(d, c);
    if (!asset.isNative()) b.addOperation(Operation.changeTrust({ asset }));
  }
  return b.setTimeout(120).build();
}

/** Solo testnet: el emisor envía activo de prueba a una cuenta con trustline. */
export async function sendTestAsset(d: Deployment, issuerSecret: string, to: string, code: AssetCode, amount: bigint) {
  if (d.network !== "testnet") throw new Error("El faucet solo existe en testnet");
  const kp = Keypair.fromSecret(issuerSecret);
  const asset = classicAsset(d, code);
  if (asset.getIssuer() !== kp.publicKey()) throw new Error("La llave del faucet no es el emisor del activo");
  const acc = await server(d).getAccount(kp.publicKey());
  const units = amount.toString().padStart(8, "0");
  const tx = new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: d.networkPassphrase })
    .addOperation(Operation.payment({ destination: to, asset, amount: `${units.slice(0, -7)}.${units.slice(-7)}` }))
    .setTimeout(60)
    .build();
  tx.sign(kp);
  return submitSigned(d, tx.toXDR());
}

// ---------------- Eventos ----------------

export type HandPeysEvent =
  | { kind: "link_created"; linkId: string; merchant: string; amount: bigint; mode: number }
  | { kind: "link_paid"; linkId: string; merchant: string; payer: string; amount: bigint }
  | { kind: "link_cancelled"; linkId: string; merchant: string }
  | { kind: "held" | "released" | "refunded" | "disputed" | "resolved"; linkId: string; value: bigint }
  | { kind: "kyc_set"; address: string; level: number; expiresAt: bigint }
  | { kind: "kyc_revoked"; address: string }
  | { kind: "fee_charged"; merchant: string; token: string; net: bigint; fee: bigint };

export interface RawEvent {
  id: string;
  ledger: number;
  txHash: string;
  contractId: string;
  topic: xdr.ScVal[];
  value: xdr.ScVal;
}

const asHex = (v: unknown) => (v instanceof Uint8Array ? bytesToHex(v) : String(v));

/** Decodifica un evento crudo de los contratos de Hand Peys. Regresa null si no es nuestro. */
export function decodeEvent(e: Pick<RawEvent, "topic" | "value">): HandPeysEvent | null {
  const topics = e.topic.map((t) => scValToNative(t));
  const name = String(topics[0]);
  const v = scValToNative(e.value);
  switch (name) {
    case "link_created":
      return { kind: name, linkId: asHex(topics[1]), merchant: topics[2], amount: BigInt(v[0]), mode: Number(v[1]) };
    case "link_paid":
      return { kind: name, linkId: asHex(topics[1]), merchant: topics[2], payer: v[0], amount: BigInt(v[1]) };
    case "link_cancelled":
      return { kind: name, linkId: asHex(topics[1]), merchant: topics[2] };
    case "held":
    case "released":
    case "refunded":
    case "disputed":
    case "resolved":
      return { kind: name, linkId: asHex(topics[1]), value: BigInt(v) };
    case "kyc_set":
      return { kind: name, address: topics[1], level: Number(v[0]), expiresAt: BigInt(v[1]) };
    case "kyc_revoked":
      return { kind: name, address: topics[1] };
    case "fee_charged":
      return { kind: name, merchant: topics[1], token: topics[2], net: BigInt(v[0]), fee: BigInt(v[1]) };
    default:
      return null;
  }
}

/** Lee eventos de nuestros contratos desde `startLedger` o un cursor. */
export async function fetchEvents(d: Deployment, from: { startLedger?: number; cursor?: string }) {
  const s = server(d);
  const contractIds = [d.contracts.payment_link, d.contracts.escrow, d.contracts.kyc_registry];
  const filters = [{ type: "contract" as const, contractIds }];
  const res = from.cursor
    ? await s.getEvents({ filters, cursor: from.cursor, limit: 200 })
    : await s.getEvents({ filters, startLedger: from.startLedger ?? (await s.getLatestLedger()).sequence - 100, limit: 200 });
  const events: RawEvent[] = res.events.map((ev) => ({
    id: ev.id,
    ledger: ev.ledger,
    txHash: ev.txHash,
    contractId: ev.contractId?.toString() ?? "",
    topic: ev.topic,
    value: ev.value,
  }));
  return { events, cursor: res.cursor, latestLedger: res.latestLedger };
}

export const explorerTx = (d: Pick<Deployment, "explorer">, hash: string) => `${d.explorer}/tx/${hash}`;
export const explorerContract = (d: Pick<Deployment, "explorer">, id: string) => `${d.explorer}/contract/${id}`;

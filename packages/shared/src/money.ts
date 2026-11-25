/** Todos los activos (MXNe, USDC) usan 7 decimales en Stellar. */
export const STELLAR_DECIMALS = 7;
const SCALE = 10n ** BigInt(STELLAR_DECIMALS);

export type AssetCode = "MXNE" | "USDC";

export const ASSETS: Record<AssetCode, { label: string; short: string; symbol: string; currency: "MXN" | "USD" }> = {
  MXNE: { label: "Pesos digitales (MXNe)", short: "Pesos", symbol: "$", currency: "MXN" },
  USDC: { label: "Dólares digitales (USDC)", short: "Dólares", symbol: "US$", currency: "USD" },
};

/** "350.5" → 3505000000n (unidades mínimas). Rechaza más de 7 decimales. */
export function toUnits(amount: string | number): bigint {
  const s = typeof amount === "number" ? amount.toFixed(STELLAR_DECIMALS) : amount.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`Monto inválido: ${amount}`);
  const [int, frac = ""] = s.split(".");
  const fracTrim = frac.replace(/0+$/, "");
  if (fracTrim.length > STELLAR_DECIMALS) throw new Error(`Máximo ${STELLAR_DECIMALS} decimales`);
  return BigInt(int!) * SCALE + BigInt(fracTrim.padEnd(STELLAR_DECIMALS, "0") || "0");
}

/** 3505000000n → "350.5" */
export function fromUnits(units: bigint | string): string {
  const u = BigInt(units);
  const neg = u < 0n;
  const abs = neg ? -u : u;
  const int = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(STELLAR_DECIMALS, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${int}${frac ? "." + frac : ""}`;
}

/** Comisión truncada (a favor del comercio), igual que en fee_splitter. */
export function computeFee(units: bigint, feeBps: number): bigint {
  return (units * BigInt(feeBps)) / 10_000n;
}

/** Formato para humanos: "$350.00 MXN" / "US$10.00 USD". */
export function formatMoney(units: bigint | string, asset: AssetCode = "MXNE"): string {
  const value = Number(fromUnits(units));
  const meta = ASSETS[asset];
  const n = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  return `${meta.symbol}${n} ${meta.currency}`;
}

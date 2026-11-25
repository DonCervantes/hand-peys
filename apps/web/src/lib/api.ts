const TOKEN_KEY = "hp_token";

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* modo privado */
    }
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as any).error ?? "Algo salió mal");
  return data as T;
}

// ---- Tipos de respuesta ----
export type AssetCode = "MXNE" | "USDC";

export interface Merchant {
  id: string;
  name: string;
  category: string;
  city: string | null;
  wallet: string;
  kycStatus: "none" | "pending" | "approved" | "rejected" | "suspended";
  kycLevel: number;
  kycTxHash: string | null;
  role: "comercio_owner" | "comercio_cajero";
}

export interface Me {
  user: { id: string; email: string | null; wallet: string | null; platformRole: "super_admin" | "cumplimiento" | null };
  merchants: Merchant[];
}

export interface LinkRow {
  id: string;
  amountUnits: string;
  asset: AssetCode;
  description: string;
  mode: "direct" | "escrow";
  status: "pending" | "open" | "paid" | "cancelled" | "expired";
  expiresAt: number;
  createdAt: number;
}

export interface PaymentRow {
  linkId: string;
  payer: string;
  amountUnits: string;
  feeUnits: string;
  asset: AssetCode;
  status: "settled" | "held" | "released" | "refunded" | "disputed" | "resolved";
  txHash: string;
  createdAt: number;
  description: string;
  mode: "direct" | "escrow";
}

export interface PublicLink {
  id: string;
  description: string;
  amountUnits: string;
  asset: AssetCode;
  mode: "direct" | "escrow";
  status: LinkRow["status"];
  expiresAt: number;
  merchant: { name: string; city: string | null; category: string; wallet: string; verified: boolean };
  payment: { status: PaymentRow["status"]; payer: string; txHash: string; createdAt: number; explorerUrl: string } | null;
  chain: { network: string; demo: boolean; paymentLink: string; escrow: string; token: string | null };
}

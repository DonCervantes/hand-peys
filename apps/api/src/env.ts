import type { Deployment, NetworkName } from "@hand-peys/stellar";
import networks from "../../../config/networks.json";
import testnet from "../../../deployments/testnet.json";
import mainnet from "../../../deployments/mainnet.json";

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  ASSETS?: Fetcher;
  EVENTS_QUEUE?: Queue<SerializedEvent>;
  ENVIRONMENT: "local" | "testnet" | "mainnet";
  NETWORK: NetworkName;
  APP_URL: string;
  POLLAR_API_URL: string;
  POLLAR_SECRET?: string;
  COMPLIANCE_SIGNER_SECRET?: string;
  SESSION_SECRET: string;
  KYC_LEVEL1_MONTHLY_LIMIT_MXN: string;
  /** Wallets (G...) separadas por coma que reciben el rol de plataforma al iniciar sesión. */
  SUPER_ADMIN_WALLETS?: string;
  COMPLIANCE_WALLETS?: string;
}

export interface SessionUser {
  id: string;
  pollarId: string;
  email: string | null;
  wallet: string | null;
  platformRole: "super_admin" | "cumplimiento" | null;
}

export type AppEnv = { Bindings: Env; Variables: { user: SessionUser } };

/** Evento serializado para la cola (ScVal en base64). */
export interface SerializedEvent {
  id: string;
  ledger: number;
  txHash: string;
  topic: string[];
  value: string;
}

export function getDeployment(network: NetworkName): Deployment {
  const net = networks[network];
  const dep = network === "mainnet" ? mainnet : testnet;
  return {
    network,
    rpcUrl: net.rpcUrl,
    networkPassphrase: net.networkPassphrase,
    explorer: net.explorer,
    contracts: dep.contracts,
    tokens: dep.tokens,
  };
}

export const isDeployed = (d: Deployment) => Boolean(d.contracts.payment_link);

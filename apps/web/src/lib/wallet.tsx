/**
 * Capa de wallet: Pollar en producción; wallet demo local (Keypair en el
 * navegador, fondeada con Friendbot en testnet) si no hay VITE_POLLAR_API_KEY.
 * El resto de la app solo usa `useWallet()`.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { PollarProvider, usePollar } from "@pollar/react";
import "@pollar/react/styles.css";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { submitSigned, type Deployment } from "@hand-peys/stellar";

export interface Wallet {
  kind: "pollar" | "demo";
  address: string | null;
  ready: boolean;
  connect: () => void;
  disconnect: () => void;
  /** Firma SEP-53 (base64). */
  signMessage: (message: string) => Promise<string>;
  /** Firma y envía una tx (XDR sin firmar, ya preparada). Regresa el hash. */
  signAndSubmit: (xdr: string, d: Deployment) => Promise<string>;
  /** Abre el flujo de verificación de identidad (Didit vía Pollar). */
  openKyc: (onDone: () => void) => void;
}

const WalletCtx = createContext<Wallet | null>(null);
export const useWallet = () => {
  const w = useContext(WalletCtx);
  if (!w) throw new Error("useWallet fuera de WalletProvider");
  return w;
};

const POLLAR_KEY = import.meta.env.VITE_POLLAR_API_KEY as string | undefined;
const NETWORK = (import.meta.env.VITE_STELLAR_NETWORK as "testnet" | "mainnet" | undefined) ?? "testnet";

// ---------------- Pollar ----------------
function PollarBridge({ children }: { children: ReactNode }) {
  const p = usePollar();
  const wallet = useMemo<Wallet>(
    () => ({
      kind: "pollar",
      address: p.wallet?.address ?? null,
      ready: p.isAuthenticated && p.verified && Boolean(p.wallet?.address),
      connect: () => p.openLoginModal(),
      disconnect: () => p.logout(),
      async signMessage(message) {
        const proof = await p.getClient().stellar.sep53.signMessage(message);
        if (proof.status !== "signed") throw new Error("No se pudo firmar con tu wallet");
        return proof.signature;
      },
      async signAndSubmit(xdr) {
        const out = await p.signAndSubmitTx(xdr);
        if (out.status === "success" || out.status === "pending") return out.hash;
        if (out.status === "cosign_pending") throw new Error("Falta aprobar la operación en tu otro dispositivo");
        throw new Error(out.message ?? "No se pudo completar el pago");
      },
      openKyc: (onDone) => p.openKycModal({ country: "MX", level: "basic", onApproved: onDone }),
    }),
    [p]
  );
  return <WalletCtx.Provider value={wallet}>{children}</WalletCtx.Provider>;
}

// ---------------- Demo (sin Pollar) ----------------
const DEMO_KEY = "hp_demo_secret";
const SEP53_PREFIX = "Stellar Signed Message:\n";

async function sha256(text: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

function DemoWalletProvider({ children }: { children: ReactNode }) {
  const [secret, setSecret] = useState<string | null>(() => {
    try {
      return localStorage.getItem(DEMO_KEY);
    } catch {
      return null;
    }
  });
  const kp = secret ? Keypair.fromSecret(secret) : null;

  const wallet: Wallet = {
    kind: "demo",
    address: kp?.publicKey() ?? null,
    ready: Boolean(kp),
    connect: () => {
      const k = Keypair.random();
      try {
        localStorage.setItem(DEMO_KEY, k.secret());
      } catch {
        /* sin storage: la sesión dura lo que la pestaña */
      }
      if (NETWORK === "testnet") fetch(`https://friendbot.stellar.org/?addr=${k.publicKey()}`).catch(() => {});
      setSecret(k.secret());
    },
    disconnect: () => {
      try {
        localStorage.removeItem(DEMO_KEY);
      } catch {
        /* ok */
      }
      setSecret(null);
    },
    async signMessage(message) {
      if (!kp) throw new Error("Conecta tu wallet");
      const sig = kp.sign(Buffer.from(await sha256(SEP53_PREFIX + message)));
      return btoa(String.fromCharCode(...sig));
    },
    async signAndSubmit(xdr, d) {
      if (!kp) throw new Error("Conecta tu wallet");
      const tx = TransactionBuilder.fromXDR(xdr, d.networkPassphrase);
      tx.sign(kp);
      return submitSigned(d, tx.toXDR());
    },
    openKyc: (onDone) => {
      // Sin Pollar no hay Didit: en local la API aprueba el KYC al sincronizar.
      setTimeout(onDone, 600);
    },
  };
  return <WalletCtx.Provider value={wallet}>{children}</WalletCtx.Provider>;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  if (!POLLAR_KEY) return <DemoWalletProvider>{children}</DemoWalletProvider>;
  return (
    <PollarProvider client={{ apiKey: POLLAR_KEY, stellarNetwork: NETWORK }}>
      <PollarBridge>{children}</PollarBridge>
    </PollarProvider>
  );
}

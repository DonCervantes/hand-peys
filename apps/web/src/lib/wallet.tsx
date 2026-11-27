/**
 * Capa de wallet: Pollar en producción; wallet demo local (Keypair en el
 * navegador, fondeada con Friendbot en testnet) si no hay VITE_POLLAR_API_KEY.
 * El resto de la app solo usa `useWallet()`.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PollarProvider, usePollar } from "@pollar/react";
import type { AuthState } from "@pollar/core";
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
  /** Solo Pollar: login sin la ventana de Pollar (formulario propio). */
  login?: LoginApi;
}

/** Pasos del login de Pollar que muestra nuestro formulario. */
export interface LoginApi {
  step: string;
  email: string | null;
  error: string | null;
  /** Envía el código al correo (crea la sesión de login si hace falta). */
  sendCode: (email: string) => void;
  verifyCode: (code: string) => void;
  google: () => void;
  cancel: () => void;
}

const AUTH_ERRORS: Record<string, string> = {
  EMAIL_SEND_FAILED: "No pudimos enviar el código. Revisa el correo e intenta de nuevo.",
  EMAIL_CODE_INVALID: "El código no es correcto.",
  EMAIL_CODE_EXPIRED: "El código ya venció. Pide uno nuevo.",
  EMAIL_VERIFY_FAILED: "No pudimos verificar el código. Intenta de nuevo.",
  LOGIN_TIMEOUT: "Se acabó el tiempo para entrar. Intenta de nuevo.",
  SESSION_CREATE_FAILED: "No pudimos conectar con Pollar. Intenta de nuevo.",
  SESSION_EXPIRED: "Tu sesión venció. Entra de nuevo.",
  AUTH_FAILED: "No pudimos iniciar tu sesión. Intenta de nuevo.",
};

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
  // Estado del login (headless): lo dibuja nuestro formulario, no la ventana de Pollar.
  const client = p.getClient();
  const [auth, setAuth] = useState<AuthState>(() => client.getAuthState());
  const pendingEmail = useRef<string | null>(null);
  useEffect(
    () =>
      client.onAuthStateChange((s) => {
        if (DEBUG) console.info("[HandPeys] auth", s.step, s.step === "error" ? s.errorCode : "");
        setAuth(s);
        // Al quedar lista la sesión de login, enviamos el código al correo pendiente.
        if (s.step === "entering_email" && pendingEmail.current) {
          const email = pendingEmail.current;
          pendingEmail.current = null;
          client.sendEmailCode(email);
        }
      }),
    [client]
  );
  const login = useMemo<LoginApi>(
    () => ({
      step: auth.step,
      email: "email" in auth ? (auth.email ?? null) : null,
      error: auth.step === "error" ? (AUTH_ERRORS[auth.errorCode] ?? auth.message ?? "Algo salió mal, intenta de nuevo.") : null,
      sendCode(email) {
        const s = client.getAuthState();
        if (s.step === "entering_email" || s.step === "entering_code") client.sendEmailCode(email);
        else {
          pendingEmail.current = email;
          if (s.step !== "idle" && s.step !== "error") client.cancelLogin();
          client.beginEmailLogin();
        }
      },
      verifyCode: (code) => client.verifyEmailCode(code),
      google: () => p.login({ provider: "google" }),
      cancel: () => {
        pendingEmail.current = null;
        client.cancelLogin();
      },
    }),
    [auth, client, p]
  );
  // Si la app de Pollar crea wallets bajo demanda, la creamos al iniciar sesión.
  const creating = useRef(false);
  useEffect(() => {
    if (p.isAuthenticated && p.verified && !p.hasWallet && !creating.current) {
      creating.current = true;
      p.createWallet()
        .catch((e) => console.error("Pollar createWallet", e))
        .finally(() => (creating.current = false));
    }
  }, [p.isAuthenticated, p.verified, p.hasWallet, p]);
  useEffect(() => {
    if (DEBUG)
      console.info("[HandPeys] pollar", {
        isAuthenticated: p.isAuthenticated,
        verified: p.verified,
        hasWallet: p.hasWallet,
        custody: p.wallet?.custody,
        address: p.wallet?.address,
        configStatus: p.configStatus,
      });
  }, [p.isAuthenticated, p.verified, p.hasWallet, p.wallet?.address, p.wallet?.custody, p.configStatus]);
  const wallet = useMemo<Wallet>(
    () => ({
      kind: "pollar",
      address: p.wallet?.address ?? null,
      ready: p.isAuthenticated && p.verified && Boolean(p.wallet?.address),
      // El login lo dibuja <LoginPanel> con `login`; aquí solo arrancamos el flujo de correo.
      connect: () => client.beginEmailLogin(),
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
      login,
    }),
    [p, client, login]
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

// Diagnóstico: agrega ?debug=1 a la URL (se recuerda en esta pestaña) para ver los logs de Pollar.
const DEBUG = (() => {
  try {
    if (new URLSearchParams(location.search).has("debug")) sessionStorage.setItem("hp_debug", "1");
    return sessionStorage.getItem("hp_debug") === "1";
  } catch {
    return false;
  }
})();

// Configuración estable (una sola instancia de PollarClient por carga de página).
const POLLAR_CONFIG = POLLAR_KEY
  ? { apiKey: POLLAR_KEY, stellarNetwork: NETWORK, logLevel: DEBUG ? ("debug" as const) : ("warn" as const) }
  : null;

export function WalletProvider({ children }: { children: ReactNode }) {
  if (!POLLAR_CONFIG) return <DemoWalletProvider>{children}</DemoWalletProvider>;
  return (
    <PollarProvider client={POLLAR_CONFIG}>
      <PollarBridge>{children}</PollarBridge>
    </PollarProvider>
  );
}

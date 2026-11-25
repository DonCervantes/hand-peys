/**
 * Autenticación por firma SEP-53 (Stellar Signed Message).
 * Firma = ed25519 sobre SHA-256("Stellar Signed Message:\n" + mensaje).
 * Pollar la produce con `client.stellar.sep53.signMessage(msg)`, igual que Freighter.
 */
import { Keypair } from "@stellar/stellar-sdk";

export const SEP53_PREFIX = "Stellar Signed Message:\n";

export async function sep53Digest(message: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(SEP53_PREFIX + message);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

export async function verifySep53(wallet: string, message: string, signatureB64: string): Promise<boolean> {
  try {
    const kp = Keypair.fromPublicKey(wallet);
    const sig = Uint8Array.from(atob(signatureB64), (c) => c.charCodeAt(0));
    return kp.verify(Buffer.from(await sep53Digest(message)), Buffer.from(sig));
  } catch {
    return false;
  }
}

/** Solo para tests / scripts: firma como lo haría la wallet. */
export async function signSep53(secret: string, message: string): Promise<string> {
  const sig = Keypair.fromSecret(secret).sign(Buffer.from(await sep53Digest(message)));
  return btoa(String.fromCharCode(...sig));
}

export function challengeMessage(wallet: string, nonce: string, issuedAt: number, domain: string) {
  return `Hand Peys quiere confirmar que esta wallet es tuya.\n\nDominio: ${domain}\nWallet: ${wallet}\nNonce: ${nonce}\nEmitido: ${new Date(issuedAt).toISOString()}`;
}

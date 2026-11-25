import { useState } from "react";
import type { Transaction } from "@stellar/stellar-sdk";
import type { Deployment } from "@hand-peys/stellar";
import { useConfig } from "./session";
import { useWallet } from "./wallet";

/** Traduce errores de contrato (#[contracterror]) a mensajes para humanos. */
const CONTRACT_ERRORS: Record<string, string> = {
  "payment_link:4": "Tu comercio aún no está verificado on-chain.",
  "payment_link:5": "Ese activo no está permitido.",
  "payment_link:11": "Este link ya no está abierto.",
  "payment_link:12": "Este link ya venció.",
  "payment_link:13": "No te puedes pagar a ti mismo.",
  "escrow:6": "Esta operación ya no se puede hacer en el estado actual.",
  "escrow:7": "Todavía no se cumple el plazo de la garantía.",
};

export function humanError(e: unknown, contract?: string): string {
  const msg = (e as Error)?.message ?? String(e);
  const m = msg.match(/Error\(Contract, #(\d+)\)/);
  if (m && contract && CONTRACT_ERRORS[`${contract}:${m[1]}`]) return CONTRACT_ERRORS[`${contract}:${m[1]}`]!;
  if (/insufficient|underfunded|balance/i.test(msg)) return "No tienes saldo suficiente en ese activo.";
  if (/trustline/i.test(msg)) return "Tu wallet todavía no tiene habilitado ese activo.";
  return msg.length > 160 ? "No se pudo completar la operación. Intenta de nuevo." : msg;
}

/** Construye (simula) una tx con @hand-peys/stellar, la firma con la wallet y la envía. */
export function useContractTx(contract?: string) {
  const wallet = useWallet();
  const { data: config } = useConfig();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(build: (d: Deployment) => Promise<Transaction>): Promise<string | null> {
    if (!config) return null;
    setPending(true);
    setError(null);
    try {
      const tx = await build(config);
      return await wallet.signAndSubmit(tx.toXDR(), config);
    } catch (e) {
      setError(humanError(e, contract));
      return null;
    } finally {
      setPending(false);
    }
  }
  return { run, pending, error, setError, config };
}

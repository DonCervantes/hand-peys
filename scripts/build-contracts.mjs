#!/usr/bin/env node
// Compila los 4 contratos a wasm (wasm32v1-none) y los optimiza.
// Usamos `cargo rustc --crate-type cdylib` para que los crates queden como `lib`
// en host (evita "export ordinal too large" en Windows-gnu con testutils).
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contractsDir = join(root, "contracts");
export const CONTRACTS = ["kyc_registry", "fee_splitter", "payment_link", "escrow"];
const out = join(contractsDir, "target", "wasm32v1-none", "release");
const dist = join(contractsDir, "dist");

const run = (cmd, cwd = contractsDir) => execSync(cmd, { cwd, stdio: "inherit" });

if (!existsSync(dist)) mkdirSync(dist, { recursive: true });
for (const c of CONTRACTS) {
  console.log(`\n▶ Compilando ${c}`);
  run(`cargo rustc -q -p ${c} --release --target wasm32v1-none --crate-type cdylib`);
  const wasm = join(out, `${c}.wasm`);
  const target = join(dist, `${c}.wasm`);
  try {
    run(`stellar contract optimize --wasm "${wasm}" --wasm-out "${target}"`);
  } catch {
    console.warn(`  (optimize no disponible, copio el wasm sin optimizar)`);
    copyFileSync(wasm, target);
  }
}
console.log(`\n✅ Wasm listos en contracts/dist/`);

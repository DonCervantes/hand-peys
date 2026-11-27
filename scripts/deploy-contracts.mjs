#!/usr/bin/env node
// Despliega e inicializa kyc_registry, fee_splitter, payment_link y escrow.
// Uso: node scripts/deploy-contracts.mjs --network testnet --source deployer [--compliance <G...>] [--treasury <G...>]
// En testnet también emite MXNe/USDC de prueba y despliega sus SAC.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith("--") ? [...acc, [a.slice(2), arr[i + 1]]] : acc), [])
);
const network = args.network ?? "testnet";
const source = args.source ?? "deployer";
const cfg = JSON.parse(readFileSync(join(root, "config", "networks.json"), "utf8"));
const net = cfg[network];
if (!net) throw new Error(`Red desconocida: ${network}`);

const sh = (cmd) => {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
};
const common = `--source ${source} --network ${network}`;
const addrOf = (key) => sh(`stellar keys address ${key}`);

if (network === "mainnet" && !args["i-know-this-is-mainnet"]) {
  console.error("Para mainnet agrega --i-know-this-is-mainnet true (HP-040, firma Daniel).");
  process.exit(1);
}
for (const a of Object.values(net.assets)) {
  if (a.issuer.startsWith("TODO")) throw new Error(`Emisor sin verificar para ${a.code} (HP-038)`);
}
// Llaves de admin, cumplimiento y tesorería pueden ser alias de `stellar keys` o direcciones G...

const admin = addrOf(source);
const compliance = args.compliance ?? admin;
const treasury = args.treasury ?? admin;

sh(`node scripts/build-contracts.mjs`);
const wasm = (c) => join("contracts", "dist", `${c}.wasm`);
const deploy = (c) => sh(`stellar contract deploy --wasm ${wasm(c)} ${common} --alias hp_${c}_${network}`);
const invoke = (id, fn, params) => sh(`stellar contract invoke --id ${id} ${common} -- ${fn} ${params}`);

// Tokens (SAC)
const tokens = {};
for (const [key, a] of Object.entries(net.assets)) {
  if (a.issuer === "native") {
    // El SAC de XLM ya existe en cada red; solo obtenemos su id.
    tokens[key] = { asset: "native", contractId: sh(`stellar contract id asset --asset native --network ${network}`), decimals: a.decimals };
    continue;
  }
  const issuer = a.issuer === "DEPLOYER" ? admin : a.issuer;
  const asset = `${a.code}:${issuer}`;
  let id;
  try {
    id = sh(`stellar contract asset deploy --asset ${asset} ${common}`);
  } catch {
    id = sh(`stellar contract id asset --asset ${asset} --network ${network}`);
  }
  tokens[key] = { asset, contractId: id, decimals: a.decimals };
}

const ids = {};
for (const c of ["kyc_registry", "fee_splitter", "payment_link", "escrow"]) ids[c] = deploy(c);

invoke(ids.kyc_registry, "init", `--admin ${admin} --compliance ${compliance}`);
invoke(ids.fee_splitter, "init", `--admin ${admin} --treasury ${treasury} --fee_bps ${cfg.params.feeBps}`);
invoke(
  ids.payment_link,
  "init",
  `--admin ${admin} --kyc ${ids.kyc_registry} --splitter ${ids.fee_splitter} --escrow ${ids.escrow} --escrow_window_secs ${cfg.params.escrowWindowSecs}`
);
invoke(ids.escrow, "init", `--admin ${admin} --compliance ${compliance} --link_contract ${ids.payment_link} --splitter ${ids.fee_splitter}`);
for (const t of Object.values(tokens)) invoke(ids.payment_link, "allow_token", `--token ${t.contractId} --allowed true`);

const out = {
  network,
  deployedAt: new Date().toISOString(),
  admin,
  compliance,
  treasury,
  contracts: ids,
  tokens,
  params: cfg.params,
};
mkdirSync(join(root, "deployments"), { recursive: true });
writeFileSync(join(root, "deployments", `${network}.json`), JSON.stringify(out, null, 2) + "\n");
console.log(`\n✅ deployments/${network}.json escrito`);

// Bindings TS
for (const c of Object.keys(ids)) {
  sh(`stellar contract bindings typescript --wasm ${wasm(c)} --output-dir packages/stellar/src/generated/${c} --overwrite`);
}
console.log("✅ Bindings TS generados en packages/stellar/src/generated/");

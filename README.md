# Hand Peys 🇲🇽

> **Cobra con un link. Recibe pesos digitales. Sin terminal, sin comisiones abusivas.**

Links y QR de cobro en **MXNe** y **USDC** sobre **Stellar**, con wallet y KYC de **Pollar** y reglas en contratos **Soroban**. Comisión: **0.9%** por cobro pagado.

Proyecto para el **Ship It: Builder Challenge (BAF × Stellar México)**, 23–27 nov 2026.

| | |
|---|---|
| 🌐 App (testnet) | `https://hand-peys.cruzcervantesdanieladrianelias.workers.dev` *(después de HP-035)* |
| 🚀 Mainnet | *(HP-041)* |
| 📜 Contratos | ver [`deployments/`](deployments/) |
| 🎬 Demo | [`docs/DEMO.md`](docs/DEMO.md) |

## Qué hace

1. El comercio entra con Pollar (Google o correo) y verifica su identidad una vez (Didit vía Pollar).
2. Crea un cobro: `$350 MXN – 10 tamales`, directo o **con garantía**.
3. Comparte el link o el QR por WhatsApp.
4. El cliente paga en segundos con su wallet Pollar; el comercio recibe `monto − 0.9%`.
5. En modo garantía, el dinero queda en escrow hasta que el cliente confirma la entrega.

**Regla de oro:** `payment_link.create_link` solo funciona si `kyc_registry.is_verified(merchant)` es `true` (validado on-chain).

## Estructura

```
apps/web        React 19 + Vite + Tailwind + TanStack Router + @pollar/react
apps/api        Hono en Cloudflare Workers + D1 (Drizzle) + KV + Cron (+ Queues opcional)
contracts/      kyc_registry · fee_splitter · payment_link · escrow (Rust/Soroban)
packages/shared Tipos, zod, dinero (7 decimales), roles
packages/stellar Construcción de tx, firma de cumplimiento, decodificación de eventos
scripts/        build y deploy de contratos
docs/           PRD, TDR, arquitectura, negocio, demo, seguridad
```

## Correr en local (modo demo, sin Pollar ni contratos)

Requisitos: Node 20+, pnpm, Rust + `wasm32v1-none`, Stellar CLI.

```bash
pnpm install
cp apps/api/.dev.vars.example apps/api/.dev.vars
pnpm --filter @hand-peys/api db:migrate:local
pnpm --filter @hand-peys/web build
pnpm --filter @hand-peys/api exec wrangler dev --port 8787
# abre http://localhost:8787
```

Sin `VITE_POLLAR_API_KEY`, la web usa una **wallet demo** (Keypair en el navegador) y la API aprueba el KYC al sincronizar. Sin contratos desplegados, el pago se simula (`/api/p/:id/demo-pay`). Con contratos en testnet, todo va on-chain.

Para desarrollar el front con recarga en caliente: `pnpm --filter @hand-peys/web dev` (proxy de `/api` a `:8787`).

## Pruebas

```bash
pnpm contracts:test          # 34 tests: unitarios + integración de los 4 contratos con SAC real
pnpm -r test                 # shared, stellar (eventos) y API (Hono + D1 sobre node:sqlite)
pnpm --filter @hand-peys/web exec playwright test   # E2E del flujo completo (modo demo)
```

## Deploy

**Contratos (testnet):**

```bash
stellar keys generate deployer --network testnet --fund
node scripts/deploy-contracts.mjs --network testnet --source deployer
# → deployments/testnet.json + bindings TS en packages/stellar/src/generated/
```

En testnet el script emite MXNe/USDC de prueba con la cuenta deployer. En mainnet exige los emisores verificados en `config/networks.json` (HP-038) y la bandera `--i-know-this-is-mainnet true`.

**Web + API (Cloudflare):**

```bash
cd apps/api
wrangler d1 create hand-peys-db          # pega el id en wrangler.jsonc
wrangler kv namespace create KV          # pega el id en wrangler.jsonc
wrangler secret put SESSION_SECRET
wrangler secret put COMPLIANCE_SIGNER_SECRET   # llave de la cuenta cumplimiento
wrangler secret put POLLAR_SECRET
pnpm db:migrate:remote
VITE_POLLAR_API_KEY=... pnpm --filter @hand-peys/web build && wrangler deploy
```

## Seguridad (resumen)

- Login por **firma SEP-53** de la wallet (reto de un solo uso en KV, 5 min); sesión JWT HS256.
- Roles verificados en servidor en cada endpoint; invitaciones de cajero por link secreto de un solo uso.
- KYC: la API vuelve a consultar a Pollar del lado del servidor; on-chain solo se guarda nivel, expiración y hash de la referencia.
- Contratos: `require_auth` en cada acción, errores tipados, sin `unwrap` en rutas de usuario, `pause`/`upgrade` solo admin, `fee_bps ≤ 300`, comisión truncada a favor del comercio.

Detalles en [`docs/SECURITY.md`](docs/SECURITY.md).

## Licencia

MIT

# TDR · Decisiones técnicas

Documento vivo. Cada decisión relevante tiene un ADR corto.

## ADR-001 · Monorepo pnpm limpio
Reusar ideas de `handle-pay` y `Linkpay`, pero empezar limpio para que cada ticket sea un commit con código real. `packages/shared` y `packages/stellar` se comparten entre web y API.

## ADR-002 · soroban-sdk 25 y crates `lib`
- `soroban-sdk 23.x` trae un conflicto (`ed25519-dalek 3` vs `rand_core`) que rompe la compilación de `testutils`. Se usa **25**.
- En Windows-gnu, un `cdylib` nativo con `testutils` excede 65 535 símbolos exportados (`export ordinal too large`). Los crates se declaran como `lib` y el wasm se genera con `cargo rustc --crate-type cdylib --target wasm32v1-none` (`scripts/build-contracts.mjs`). `stellar contract build` no se usa porque filtra por `cdylib` en el manifest.
- ⚠️ Antes de mainnet (HP-038/040): confirmar que el protocolo vigente en mainnet soporta wasm de sdk 25.

## ADR-003 · Escrow calcula la comisión leyendo `fee_splitter.get_config`
Que `escrow` invoque `fee_splitter.split` con `from = escrow` exigiría autorizar sub-invocaciones (`authorize_as_current_contract`). Es más simple y seguro que `escrow` lea `treasury` y `fee_bps` y transfiera él mismo. Misma fórmula truncada que `fee_splitter`.

## ADR-004 · `escrow.hold` solo lo invoca `payment_link`
`link_contract.require_auth()` en `hold`: un contrato que invoca directamente queda autorizado, cualquier otro caller falla. Evita que alguien "ocupe" un id de link en el escrow.

## ADR-005 · Ids de link = `BytesN<16>`
UUID-like aleatorio de 16 bytes generado por la API (`newLinkId`), hex en URLs. Sin colisiones prácticas y sin depender de `Symbol` (32 chars, alfabeto limitado).

## ADR-006 · Autenticación por firma SEP-53, no por endpoint de Pollar
`@pollar/core` expone `client.stellar.sep53.signMessage(msg)` (ed25519 sobre `SHA-256("Stellar Signed Message:\n" + msg)`), igual que Freighter. La API emite un reto de un solo uso (KV, 5 min) y verifica la firma con `stellar-sdk`. Así la sesión no depende de rutas de servidor de Pollar no documentadas y funciona con cualquier wallet G. Limitación: smart wallets (`C...`) no firman SEP-53 → MVP solo cuentas `G`.

## ADR-007 · KYC re-consultado en servidor + `set_status` firmado por cumplimiento
Los webhooks de Pollar están "upcoming", así que: el front hace polling → `POST /merchants/:id/kyc/sync` → la API consulta Pollar con `POLLAR_SECRET` → si aprobado, firma `kyc_registry.set_status` con `COMPLIANCE_SIGNER_SECRET`. Cron cada 5 min reconcilia pendientes. ⚠️ HP-016: confirmar la ruta exacta de KYC de servidor en `apps/api/src/pollar.ts` (único archivo a tocar).

## ADR-008 · Indexer: Cron → (Queue opcional) → aplicación idempotente
`getEvents` cada minuto con cursor en KV. Cada evento se aplica en un `batch` de D1 junto con su marca en `chain_events` (PK = id del evento RPC) → idempotente. Cloudflare Queues requiere Workers Paid: si no hay binding `EVENTS_QUEUE`, se procesa inline con el mismo código. `POST /api/p/:id/sync` dispara el indexer al momento tras un pago (con lock en KV).

## ADR-009 · Un solo Worker para web + API
Workers Static Assets sirve `apps/web/dist` con fallback SPA; `run_worker_first: ["/api/*"]`. Un solo dominio → sin CORS cruzado y cookies first-party.

## ADR-010 · Cajeros y `create_link`
`create_link` exige la firma del `merchant` (dueño). Un cajero crea el link en D1 como `pending` y el dueño lo confirma con un clic (firma) desde su inicio. Backlog: `operators` on-chain (`create_link_by(operator, merchant, …)`).

## ADR-011 · Modo demo
Sin `VITE_POLLAR_API_KEY` → wallet demo (Keypair en el navegador, fondeada por Friendbot en testnet). Sin contratos desplegados y `ENVIRONMENT=local` → pagos simulados por `demo-pay`, que reusa `applyEvent` (mismo camino que el indexer). Permite E2E y demos sin dependencias externas.

## Pendientes conocidos
- HP-016: endpoint de KYC de servidor de Pollar.
- HP-038: emisor oficial de MXNe en mainnet (placeholder `TODO_VERIFICAR_HP_038` bloquea el deploy).
- Comprobante en PDF/R2 (hoy HTML imprimible).
- Límite mensual por nivel KYC (`KYC_LEVEL1_MONTHLY_LIMIT_MXN` definido, falta aplicarlo al crear links).

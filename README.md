# Hand Peys 🇲🇽

> **Cobra con un link. Recibe pesos digitales en segundos. Sin terminal y por 0.9%.**

Links y QR de cobro en **MXNe** (pesos digitales) y **USDC** sobre **Stellar**. La wallet y el KYC son de **Pollar** y las reglas viven en contratos **Soroban**. La comisión es de **0.9%** por cobro pagado; una terminal tradicional cobra alrededor de 3.5% + IVA.

Proyecto para el **Ship It: Builder Challenge (BAF × Stellar México)**, 23–27 nov 2026.

| | |
|---|---|
| 🌐 App (testnet) | **https://hand-peys.cruzcervantesdanieladrianelias.workers.dev** |
| 📜 Contratos (testnet) | [`docs/TESTNET.md`](docs/TESTNET.md): IDs, funciones y transacciones de prueba |
| 🚀 Mainnet | Pendiente (HP-038 a HP-041) |
| 🎬 Guion del demo | [`docs/DEMO.md`](docs/DEMO.md) |
| 📌 Estado y pendientes | [`docs/ESTADO.md`](docs/ESTADO.md) |

## Qué hace

1. **El comercio entra** con su wallet. Con Pollar entra con Google o correo, sin frases semilla, y verifica su identidad una sola vez.
2. **Crea un cobro** (`$350 MXN · 10 tamales`), directo o **con garantía**, en pesos o dólares digitales.
3. **Lo comparte** por WhatsApp, como QR impreso o como link.
4. **El cliente paga** en segundos desde su wallet: el comercio recibe `monto − 0.9%` y la comisión va a tesorería en la misma transacción.
5. **Con garantía**, el dinero queda en escrow hasta que el cliente confirma. El comercio puede reembolsar sin comisión, el cliente puede disputar y cumplimiento resuelve. Si nadie actúa, el comercio cobra a los 7 días.

**Regla de oro:** `payment_link.create_link` solo funciona si `kyc_registry.is_verified(merchant)` es `true`. Se valida on-chain, no solo en la API.

## Estado

| Pieza | Estado |
|---|---|
| 4 contratos Soroban | ✅ Desplegados en testnet; 34 tests |
| Funciones usadas en testnet | ✅ 12 con transacción real ([`docs/TESTNET.md`](docs/TESTNET.md)) |
| API + web en Cloudflare Workers | ✅ Publicada; cron del indexer cada minuto |
| Flujo real desde la web en testnet | ✅ KYC on-chain → trustlines → `create_link` → `pay` → garantía `confirm` |
| CI (contratos, app, E2E Playwright) | ✅ En verde en `main` |
| Pollar (login con Google y KYC con Didit) | ⏳ Falta la API key y el secreto del servidor. Mientras tanto se usa una wallet de prueba en el navegador |
| Mainnet | ⏳ Verificar emisores de MXNe/USDC, fondear el deployer y desplegar |

## Arquitectura

```
apps/web          React 19 + Vite + Tailwind v4 + TanStack Router/Query + @pollar/react
apps/api          Hono en Cloudflare Workers + D1 (Drizzle) + KV + Cron (+ Queues opcional)
contracts/        kyc_registry · fee_splitter · payment_link · escrow (Rust, soroban-sdk 25)
packages/shared   Tipos, esquemas zod, dinero (7 decimales), matriz de roles
packages/stellar  Construcción de tx, trustlines, firma de cumplimiento, decodificación de eventos
scripts/          Build, deploy y prueba de contratos en testnet
docs/             PRD, TDR (ADRs), arquitectura, seguridad, negocio, demo, testnet
```

Un solo Worker sirve la API en `/api/*` y la web como assets estáticos. El cron lee los eventos de los contratos y los aplica en D1 de forma idempotente. Diagramas en [`docs/architecture.md`](docs/architecture.md).

| Contrato | Responsabilidad |
|---|---|
| `kyc_registry` | Nivel KYC, vigencia y hash de la referencia (sin datos personales). Lo escribe la cuenta de cumplimiento |
| `fee_splitter` | Divide cada pago: neto al comercio y 0.9% a tesorería (máximo 3%, truncado a favor del comercio) |
| `payment_link` | Crea, paga y cancela links; whitelist de tokens, expiración, un solo pago por link |
| `escrow` | Garantía: `hold`, `confirm`, `refund`, `dispute`, `resolve`, `claim` |

**Roles:** `super_admin`, `cumplimiento`, `comercio_owner`, `comercio_cajero` y `cliente`. Se verifican en el servidor en cada endpoint y los cajeros entran con un link de invitación secreto de un solo uso.

## Correr en local

Requisitos: Node 20+, pnpm 11, Rust con el target `wasm32v1-none` y Stellar CLI 27.

```bash
pnpm install
cp apps/api/.dev.vars.example apps/api/.dev.vars
pnpm --filter @hand-peys/api db:migrate:local
pnpm --filter @hand-peys/web build
pnpm --filter @hand-peys/api exec wrangler dev --port 8787
# abre http://localhost:8787
```

`DEMO_MODE` en `apps/api/.dev.vars` decide el modo:

| `DEMO_MODE` | Qué pasa |
|---|---|
| `true` (por defecto) | Pagos simulados y KYC automático. No necesita contratos ni llaves. Es el modo del E2E |
| `false` | Usa los contratos de `deployments/testnet.json`: KYC on-chain, trustlines y pagos reales. Requiere `COMPLIANCE_SIGNER_SECRET`, y `FAUCET_SECRET` para dar MXNe de prueba |

Sin `VITE_POLLAR_API_KEY`, la web usa una **wallet de prueba** guardada en el navegador y fondeada con Friendbot. Para el front con recarga en caliente: `pnpm --filter @hand-peys/web dev`, que pasa `/api` a `:8787`.

### Variables

| Variable | Dónde | Para qué |
|---|---|---|
| `SESSION_SECRET` | secreto del Worker | Firma de las sesiones JWT |
| `COMPLIANCE_SIGNER_SECRET` | secreto del Worker | Cuenta de cumplimiento que escribe `set_status` y `revoke` |
| `POLLAR_SECRET` | secreto del Worker | Consulta del KYC a Pollar desde el servidor |
| `FAUCET_SECRET` | secreto del Worker (solo testnet) | Emisor de MXNe/USDC de prueba para el faucet |
| `SUPER_ADMIN_WALLETS`, `COMPLIANCE_WALLETS` | vars | Wallets que reciben rol de plataforma al entrar |
| `VITE_POLLAR_API_KEY` | build de la web | Activa Pollar (pública por diseño) |
| `VITE_STELLAR_NETWORK` | build de la web | `testnet` (por defecto) o `mainnet` |

## Pruebas

```bash
pnpm contracts:test                                   # 34 tests: unitarios + integración con SAC reales
pnpm -r test                                          # 30 tests: shared, stellar y API (Hono + D1 sobre node:sqlite)
pnpm --filter @hand-peys/web exec playwright test     # E2E del flujo completo en modo demo
bash scripts/testnet-smoke.sh                         # ejercita cada función en testnet y guarda los hashes
```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) corre `cargo test`, `clippy -D warnings`, el build a wasm, typecheck, los tests y el E2E en cada push.

## Deploy

**Contratos:**

```bash
stellar keys generate hp-deployer   --network testnet --fund
stellar keys generate hp-compliance --network testnet --fund
stellar keys generate hp-treasury   --network testnet --fund
node scripts/deploy-contracts.mjs --network testnet --source hp-deployer \
  --compliance $(stellar keys address hp-compliance) --treasury $(stellar keys address hp-treasury)
# → deployments/testnet.json + bindings TS
```

En testnet, el script emite MXNe/USDC de prueba con la cuenta deployer. Tesorería debe ser una cuenta distinta del emisor, porque lo que llega al emisor se quema. En mainnet, el script exige los emisores verificados en [`config/networks.json`](config/networks.json) y la bandera `--i-know-this-is-mainnet true`.

**Web + API (Cloudflare):**

```bash
cd apps/api
wrangler d1 create hand-peys-db              # pega el id en wrangler.jsonc
wrangler kv namespace create hand-peys-kv    # pega el id en wrangler.jsonc
pnpm db:migrate:remote
wrangler secret put SESSION_SECRET
wrangler secret put COMPLIANCE_SIGNER_SECRET
wrangler secret put POLLAR_SECRET
wrangler secret put FAUCET_SECRET            # solo testnet
VITE_POLLAR_API_KEY=... pnpm --filter @hand-peys/web build && wrangler deploy
```

Mainnet usa `wrangler deploy --env mainnet`, con su propia D1 y KV. El rate limit usa el binding nativo de Cloudflare y el cursor del indexer vive en D1, así que el plan gratis de KV no se agota.

## Seguridad (resumen)

- **Login:** firma SEP-53 de la wallet con un reto de un solo uso de 5 minutos; sesión JWT HS256 de 7 días.
- **KYC:** la API vuelve a consultar a Pollar desde el servidor. On-chain solo quedan el nivel, la vigencia y el hash de la referencia.
- **Contratos:** `require_auth` en cada acción, errores tipados, efectos antes de interacciones, `pause`/`upgrade` solo para admin y `escrow.hold` solo invocable por `payment_link`.
- **API:** validación zod en todas las entradas, rate limit por IP, CORS restringido y comprobante HTML con escape.

Checklist completo y pendientes en [`docs/SECURITY.md`](docs/SECURITY.md).

## Documentación

[Estado y pendientes](docs/ESTADO.md) · [PRD](docs/PRD.md) · [TDR y ADRs](docs/TDR.md) · [Arquitectura](docs/architecture.md) · [Seguridad](docs/SECURITY.md) · [Testnet](docs/TESTNET.md) · [Negocio](docs/BUSINESS.md) · [Demo](docs/DEMO.md) · [Plan original](docs/HAND-PEYS.md)

## Licencia

[MIT](LICENSE)

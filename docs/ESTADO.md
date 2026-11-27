# Estado del proyecto y lo que falta

> Documento de traspaso entre sesiones. Última actualización: **26 nov 2026**.
> **Fecha límite:** mainnet en vivo el **viernes 27 nov 2026 antes de las 13:00 (CDMX)**.

## Dónde nos quedamos

**Pollar quedó en pausa** (ticket [POLLAR-1](#ticket-pollar-1-el-login-desaparece-en-el-chrome-del-usuario)). Ahora trabajamos en la **UX/UI** del proyecto.

- El sitio publicado volvió a la **wallet de prueba** (`pnpm --filter @hand-peys/web build`, sin la key de Pollar). Para reactivar Pollar: `pnpm --filter @hand-peys/web build:testnet` y `wrangler deploy`.
- En el sitio publicado funcionan el login y el registro del negocio. La **verificación (KYC) falla** con "Algo salió mal", porque el servidor consulta a Pollar con un endpoint supuesto (ver "Lo que falta › 1").

## Tickets abiertos

### Ticket POLLAR-1: el login desaparece en el Chrome del usuario
- **Síntoma:** en el Chrome del usuario, el cuadro de login desaparece al hacer clic o escribir en el campo del correo y no deja escribir. Pasó con la ventana de Pollar y también con el login propio que la reemplazó.
- **Lo que sí funciona:** en el panel del navegador de Claude, con `prueba@example.com`, llega a la pantalla del código (`auth:creating_session → auth:sending_email → auth:entering_code`) y avisa del código incorrecto. Ningún intento del usuario llegó al servidor.
- **Hecho para diagnosticar:**
  - Login propio en español sin la ventana de Pollar (`apps/web/src/components/LoginPanel.tsx`).
  - `translate="no"` para que Chrome no traduzca la página.
  - Reporte de errores del navegador a `POST /api/client-log`, que solo escribe en los logs del Worker, más un `ErrorBoundary` y el `defaultErrorComponent` del router.
- **Sospecha principal:** una extensión de Chrome (gestor de contraseñas, corrector o autocompletado) que modifica el campo y rompe React.
- **Próximos pasos:**
  1. Probar en incógnito (`Ctrl+Shift+N`). Si funciona, la causa es una extensión.
  2. Mientras el usuario lo intenta, leer los errores con `cd apps/api; npx wrangler tail hand-peys --search "[client]"`.
  3. O revisarlo con Claude in Chrome: la extensión no estaba conectada el 26 nov.
- **Después del login:** verificar la firma SEP-53 de la wallet de Pollar, el tipo de dirección (`G…` o `C…`), trustlines con `setTrustline` y el KYC del servidor (ver "Lo que falta › 1").

## Qué está hecho

| Pieza | Estado | Dónde |
|---|---|---|
| Contratos `kyc_registry`, `fee_splitter`, `payment_link`, `escrow` | ✅ 34 tests, clippy limpio, desplegados en testnet | `contracts/`, [`docs/TESTNET.md`](TESTNET.md) |
| 12 funciones usadas en testnet con transacción real (para el reto) | ✅ | [`docs/TESTNET.md`](TESTNET.md), `deployments/testnet-txs.json` |
| API Hono + D1 + KV + cron (indexer cada minuto) | ✅ 14 tests | `apps/api` |
| Web React (landing, registro, KYC, cobros, QR, checkout, garantía, equipo, admin) | ✅ | `apps/web` |
| Flujo real desde la web contra testnet | ✅ Probado con la wallet de prueba: KYC on-chain → trustlines → `create_link` → `pay` (346.85 neto) → garantía `confirm` (495.50 neto) | — |
| Trustlines (`AssetSetup`) y faucet de testnet (`POST /api/faucet`) | ✅ | `apps/web/src/components/AssetSetup.tsx`, `apps/api/src/routes/public.ts` |
| Publicado en Cloudflare Workers | ✅ https://hand-peys.cruzcervantesdanieladrianelias.workers.dev | `apps/api/wrangler.jsonc` |
| CI (contratos, app, E2E Playwright) | ✅ En verde en `main` | `.github/workflows/ci.yml` |
| Repo en GitHub | ✅ `DonCervantes/hand-peys`, rama `main` | — |
| Pollar: API key pública en el build de testnet | ✅ | `apps/web/.env.testnet`, `pnpm build:testnet` |
| Pollar: login de punta a punta | ❌ En pausa, ticket POLLAR-1 | — |

## Infraestructura (sin secretos)

| Recurso | Valor |
|---|---|
| Worker | `hand-peys` → https://hand-peys.cruzcervantesdanieladrianelias.workers.dev |
| D1 testnet | `hand-peys-db` · `80edaf93-9ea3-4576-b588-9f1103d74891` |
| KV testnet | `hand-peys-kv` · `d55feddeb85e4928989dc0a82da24029` |
| Rate limit | Binding nativo `RL_AUTH` (30/min) y `RL_PUBLIC` (120/min) |
| Secretos del Worker | `SESSION_SECRET`, `COMPLIANCE_SIGNER_SECRET` (llave `hp-compliance`), `FAUCET_SECRET` (llave `hp-deployer`), `POLLAR_SECRET` |
| Llaves Stellar CLI (testnet) | `hp-deployer` (admin y emisor de MXNe/USDC de prueba), `hp-compliance`, `hp-treasury`, `hp-merchant`, `hp-payer`, `hp-revoked` |
| Contratos testnet | Ver `deployments/testnet.json` |
| Pollar | App testnet con API key pública `pub_testnet_4563…` (en `apps/web/.env.testnet`) |

⚠️ El `POLLAR_SECRET` de testnet se compartió en el chat. **Hay que regenerarlo en el dashboard de Pollar** y volver a cargarlo con `cd apps/api; npx wrangler secret put POLLAR_SECRET`.

## Lo que falta (en orden)

### 1. Pollar (testnet)
- [ ] **Login:** ticket POLLAR-1.
- [ ] **Firma y dirección:** verificar SEP-53 con la wallet de Pollar y el tipo de dirección. Si es `C…`, la API (`stellarAddressSchema`) y `getAssetStatus` (Horizon) hay que adaptarlos.
- [ ] **Trustlines con Pollar:** usar `usePollar().setTrustline({ code, issuer })` cuando la wallet sea de Pollar (la app puede patrocinar la reserva). Hay que dar de alta MXNe/USDC de prueba en el dashboard (emisor `GDWC3MVIMN7MDB3QN4P2E5CRBYZ4AZHCCC2YSSEKEXZ7O72FS5U3OLTF`) y decidir si la app patrocina.
- [ ] **KYC del lado del servidor (`TODO(HP-016)` en `apps/api/src/pollar.ts`):**
  - El código llama a `api.pollar.xyz/v1/users/:id/kyc`, que es un endpoint **supuesto que no existe en el SDK**. El SDK real usa `https://sdk.api.pollar.xyz/v3` y `GET /kyc/status` solo con la sesión del usuario. Esas sesiones usan tokens DPoP, atados a una llave del navegador, así que el servidor no puede reutilizarlas.
  - **Preguntar a Pollar** si hay API de servidor con llave secreta o webhooks firmados de "KYC aprobado".
  - **Plan B:** aprobación manual de cumplimiento en `/admin/cumplimiento`, que ya escribe on-chain. Requiere poner la wallet del usuario en `COMPLIANCE_WALLETS`.
  - Mientras tanto, en el sitio publicado **el registro de comercios falla en el paso de KYC**.
- [ ] **KYC en la web:** `openKycModal({ country: "MX", level: "basic" })` requiere el proveedor (Didit) activo en el dashboard.
- [ ] **Prueba completa en el sitio publicado:** registro → KYC → cobro → pago con otra cuenta → garantía.

### 2. Mainnet (HP-038 a HP-041), antes del viernes 13:00
- [ ] **Emisores:** verificar el emisor de **MXNe** (Etherfuse, en su `stellar.toml`); hoy es el placeholder `TODO_VERIFICAR_HP_038` en `config/networks.json`, y el script de deploy se niega a seguir mientras no se cambie. Verificar también el de **USDC** (Circle; está puesto de memoria).
- [ ] **Protocolo:** confirmar que mainnet acepta wasm de soroban-sdk 25.
- [ ] **Llaves:** generar `hp-deployer`, `hp-compliance` y `hp-treasury` de mainnet. 🙋 El usuario fondea el deployer con XLM.
- [ ] **Cloudflare:** crear la D1 y el KV de mainnet y poner sus IDs en `env.mainnet` de `wrangler.jsonc`; cargar los secretos con `--env mainnet`.
- [ ] **Contratos:** `node scripts/deploy-contracts.mjs --network mainnet --source hp-deployer --compliance … --treasury … --i-know-this-is-mainnet true`.
- [ ] **Pollar Live:** 🙋 pedir el acceso Live, crear `apps/web/.env.mainnet` (key pública de mainnet) y un script `build:mainnet`.
- [ ] **Prueba con dinero real:** un cobro chico, con una wallet cliente con MXNe y su trustline.

### 3. Entrega
- [ ] Video de 2 minutos con el guion de [`docs/DEMO.md`](DEMO.md). Cortar la espera de 15–20 s del pago.
- [ ] Pitch y cifras de mercado y competencia con fuentes en [`docs/BUSINESS.md`](BUSINESS.md) (INEGI y tarifas vigentes de terminales).
- [ ] Actualizar la tabla de estado del [`README`](../README.md) con mainnet y Pollar.

### 4. Deuda técnica (después del hackathon)
- Límite mensual del KYC nivel 1 (`KYC_LEVEL1_MONTHLY_LIMIT_MXN`): existe la variable, pero no se aplica.
- Comprobante en PDF (R2); hoy es HTML imprimible.
- CSP estricta en el Worker (hay que revisar los dominios que usa Pollar).
- `COMPLIANCE_SIGNER_SECRET` a firma externa o KMS; revisión externa de los contratos.
- Bundle web de unos 2 MB: dividir el código de Pollar y stellar-sdk.
- GitHub Actions avisa que las acciones con Node 20 están deprecadas.

## Cómo retomar

```bash
# Tests
pnpm contracts:test && pnpm -r test

# Local en modo demo (DEMO_MODE=true en apps/api/.dev.vars)
pnpm --filter @hand-peys/api db:migrate:local
pnpm --filter @hand-peys/web build
pnpm --filter @hand-peys/api exec wrangler dev --port 8787

# Local contra testnet: DEMO_MODE=false en apps/api/.dev.vars (ya tiene las llaves de testnet)

# Publicar testnet (con Pollar)
pnpm --filter @hand-peys/web build:testnet
cd apps/api && npx wrangler deploy

# Diagnóstico de Pollar en el navegador
# https://hand-peys.cruzcervantesdanieladrianelias.workers.dev/app?debug=1
# → consola: [PollarClient] auth:* y [HandPeys] pollar {...}
```

## Hallazgos del SDK de Pollar 0.12 (para no repetir la investigación)

- Base URL: `https://sdk.api.pollar.xyz/v3`, con el header `x-pollar-api-key`. Las sesiones usan DPoP (RFC 9449).
- `usePollar()` expone `wallet` (`custody`: `internal` | `smart` | `external`), `hasWallet`, `createWallet()`, `verified`, `signAndSubmitTx(xdr)`, `setTrustline(asset)`, `openKycModal({ country, level, providerId, onApproved })`, `getClient().getUserProfile()`, y `getClient().getKycStatus()` (solo con la sesión del usuario).
- Si la app crea wallets bajo demanda, `PollarBridge` llama a `createWallet()` automáticamente.
- Un login con passkey crea una smart account (`C…`). Por ahora conviene dejar passkey apagado en el dashboard.
- `?debug=1` activa `logLevel: "debug"` en Pollar y los logs `[HandPeys]` (`apps/web/src/lib/wallet.tsx`).

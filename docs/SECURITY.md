# Checklist de seguridad (HP-039)

## Contratos
- [x] `require_auth` en toda acción que mueve fondos o cambia estado (merchant, payer, compliance, admin).
- [x] `escrow.hold` solo invocable por `payment_link` (ADR-004).
- [x] Errores tipados (`#[contracterror]`), sin `unwrap` en rutas de usuario.
- [x] `fee_bps ≤ 300`; comisión truncada a favor del comercio; montos `> 0`.
- [x] Un solo pago por link; expiración; whitelist de tokens; sin auto-pago.
- [x] Efectos antes de interacciones en `pay` / `escrow`.
- [x] `pause`/`unpause`/`upgrade` solo admin. TTL extendido en instance y persistent.
- [x] `cargo clippy --all-targets -D warnings` limpio.
- [ ] Revisión externa antes de manejar volumen real.

## API
- [x] Sesión por firma SEP-53 con reto de un solo uso (se consume aunque la firma falle).
- [x] JWT HS256 con `SESSION_SECRET` (secreto de wrangler), expira en 7 días.
- [x] Permisos por rol en servidor (`assertMerchantPerm`, `requirePlatform`); tests de cajero/extraño/plataforma.
- [x] Invitaciones por id secreto de un solo uso (el email declarado por el cliente no da acceso).
- [x] Validación zod en todas las entradas; errores sin stack al cliente.
- [x] Rate limit por IP en `/auth/*` y `/p/*`; `secureHeaders`; CORS restringido a `APP_URL`.
- [x] KYC re-consultado en servidor; on-chain sin datos personales (solo hash de la referencia).
- [x] Indexer idempotente (PK por id de evento + batch atómico).
- [ ] Mover `COMPLIANCE_SIGNER_SECRET` a firma externa/KMS después del hackathon.

## Web
- [x] Ningún secreto en el bundle (solo `VITE_POLLAR_API_KEY`, que es pública por diseño).
- [x] Comprobante HTML con escape de campos del usuario.
- [ ] CSP estricta en el Worker de assets (Pollar requiere revisar dominios permitidos).

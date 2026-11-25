# PRD · Hand Peys

## Problema
Micronegocios y freelancers en México pierden ventas por no aceptar tarjeta, pagan ~3.5% + IVA por terminal, esperan días por su depósito y concilian transferencias a mano.

## Usuarios
- **Comercio (dueño):** changarro, freelancer o PyME con KYC aprobado.
- **Cajero:** empleado que crea cobros y ve los del día.
- **Cliente:** paga un link desde su wallet Pollar.
- **Cumplimiento:** revisa KYC y resuelve disputas.
- **Super admin:** comisión, pausa y métricas.

## Alcance MVP (hackathon)
| # | Historia | Criterio de aceptación |
|---|---|---|
| 1 | Como comercio entro con Google/correo | Wallet Pollar conectada y sesión por firma SEP-53 |
| 2 | Verifico mi identidad una vez | KYC Didit vía Pollar → `kyc_registry.set_status` on-chain |
| 3 | Creo un cobro en MXN o USD | Link `/p/:id` + QR; on-chain falla si no hay KYC |
| 4 | Lo comparto por WhatsApp o lo imprimo | Botón WhatsApp con texto prellenado, impresión de QR |
| 5 | Mi cliente paga en segundos | `payment_link.pay` → neto al comercio, 0.9% a tesorería |
| 6 | Veo mis cobros | Dashboard con neto, comisiones, garantía y links activos |
| 7 | Vendo con garantía | Escrow: confirmar, reembolsar (gratis), disputar, reclamar tras 7 días |
| 8 | Invito cajeros | Link secreto de un solo uso; cajero sin reembolsos ni retiros |
| 9 | Cumplimiento revisa | Aprobar N1/N2, rechazar, suspender (revoca on-chain); resolver disputas |
| 10 | Super admin ajusta | `set_fee` (≤3%), pausa de contratos, métricas globales |
| 11 | Comprobante | HTML imprimible con hash en el explorador |

## Fuera de alcance
Ver `FUTUROS-FEATURES.md`: PWA/push, SPEI, CFDI, suscripciones, API pública, etc.

## Métricas
Comercios verificados, links creados, % pagados, volumen MXNe/USDC, comisiones, tiempo de pago (link → pagado).

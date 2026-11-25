# Despliegue en testnet

Desplegado el 2026-11-25 con `node scripts/deploy-contracts.mjs --network testnet --source hp-deployer --compliance <hp-compliance> --treasury <hp-treasury>`. IDs completos en [`deployments/testnet.json`](../deployments/testnet.json).

| Contrato | ID |
|---|---|
| kyc_registry | [`CC3GLG7G…KBBUX3`](https://stellar.expert/explorer/testnet/contract/CC3GLG7GR6VDYPUSC7MXMRQWFNLWGMPUPWVXJY7QI7YEEAKKNOKBBUX3) |
| fee_splitter | [`CATJXC5X…LMI6JE`](https://stellar.expert/explorer/testnet/contract/CATJXC5XBFXCDWYLN7QJRGKEIG2TLSTBDTU545FZ7K6KEFRKP4LMI6JE) |
| payment_link | [`CCFGLYZ6…SO63N`](https://stellar.expert/explorer/testnet/contract/CCFGLYZ6DZGJMDTDY73DOIRHNF4AUGO7YJOKCRZ4AWDIIMXY6F4SO63N) |
| escrow | [`CBF5XDLM…TAT5G`](https://stellar.expert/explorer/testnet/contract/CBF5XDLMJWBDA6ZPQ727W7CXAQW46M64UAWVKJEAMXJQXB6JQERTAT5G) |
| MXNe de prueba (SAC) | `CDDAMABX4LONENX7IHBLWTHIAWIH26WMN2MCHSZBJI3NEV4J5THD2KHQ` |
| USDC de prueba (SAC) | `CBXMR5BJHT65ROAYVBS6VBO6LUAYDP37XJOJLNJGGXOQWBV4OEXEUNNE` |

## Funciones con lógica, usadas en testnet y con test

Generadas con [`scripts/testnet-smoke.sh`](../scripts/testnet-smoke.sh) (hashes en [`deployments/testnet-txs.json`](../deployments/testnet-txs.json)).

| # | Función | Qué hace | Transacción | Tests |
|---|---|---|---|---|
| 1 | `payment_link.create_link` | Crea un cobro; falla si el comercio no tiene KYC on-chain (llamada a `kyc_registry`), si el token no está permitido o el id existe | [8a3a902a…](https://stellar.expert/explorer/testnet/tx/8a3a902afe3822b2a1019f0602a9cf892a40d00489e4b46cc1a1db900e9f89a3) | `create_link_without_kyc_fails`, `expired_kyc_blocks_new_links`, `duplicate_id_fails`, `token_whitelist_enforced` |
| 2 | `payment_link.pay` | Paga el link: directo → `fee_splitter.split`; garantía → `escrow.hold` | [41db37c2…](https://stellar.expert/explorer/testnet/tx/41db37c2703ee6d2ee9b35644eadd4b4255cd89751f1dab9f69834b277987bc6) | `direct_payment_splits_fee`, `double_payment_fails`, `self_payment_rejected`, `expiration_and_validation` |
| 3 | `payment_link.cancel` | Cancela un link abierto; después no se puede pagar | [d4888263…](https://stellar.expert/explorer/testnet/tx/d488826354a90fe22db8eb9fe5c36b6fa19d1c5678c2115b6aaac516da00180a) | `cancel_then_pay_fails` |
| 4 | `fee_splitter.split` | Transfiere neto al comercio y 0.9% a tesorería en una sola operación | [3470373c…](https://stellar.expert/explorer/testnet/tx/3470373cb3ae76f90469f30eb847cd3d14d96dd26ecf21c8364335206dbbee38) | `split_sends_net_and_fee`, `zero_fee_skips_treasury`, `paused_blocks_split` |
| 5 | `escrow.hold` | Retiene el pago en garantía (solo invocable por `payment_link`) | [70e3e674…](https://stellar.expert/explorer/testnet/tx/70e3e674056619ded42008b602db831cbf54b62b36072a1780bcf601730192b0) (vía `pay`) | `escrow_paid`, `escrow_hold_only_from_link_contract` |
| 6 | `escrow.confirm` | El cliente confirma y se libera al comercio con comisión | [46beacf8…](https://stellar.expert/explorer/testnet/tx/46beacf88ef637f4b9551fd5f887961d138c1af8d79b403e3b467eccc5c71b87) | `escrow_confirm_releases_with_fee` |
| 7 | `escrow.refund` | El comercio reembolsa el 100% al cliente, sin comisión | [e9831736…](https://stellar.expert/explorer/testnet/tx/e983173650b39cc61ef537922c71efdc6d6c1159346b463614f63c694a00e2c8) | `escrow_refund_is_free` |
| 8 | `escrow.dispute` | El cliente disputa; bloquea el `claim` | [19769913…](https://stellar.expert/explorer/testnet/tx/19769913af13cc423dbee842cd5a0f2755fa5ebe4ab7def524f805aae86594b9) | `escrow_dispute_blocks_claim_and_resolves` |
| 9 | `escrow.resolve` | Cumplimiento resuelve la disputa a favor de una parte | [44660507…](https://stellar.expert/explorer/testnet/tx/44660507e3cee06ac8bf25559e11cf985e4baf4c98785ed3ef5a2822bff1c231) | `escrow_resolve_to_merchant`, `escrow_dispute_blocks_claim_and_resolves` |
| 10 | `escrow.claim` | El comercio cobra tras vencer la ventana de garantía | [9a4ac1e9…](https://stellar.expert/explorer/testnet/tx/9a4ac1e9606b3a627a2ebc50ef135acbb3fa0ca31bef9f85d5dd9d9f7463d3da) | `escrow_claim_after_window` |
| 11 | `kyc_registry.set_status` | Cumplimiento registra nivel KYC con vigencia y hash de referencia (valida nivel ≤ 2 y expiración futura) | [d258cc43…](https://stellar.expert/explorer/testnet/tx/d258cc43f3690c7b5da92cfb3f4853fb6cb7aaaff7fcd7856b83a581ee975bd2) | `set_status_and_verify`, `invalid_level_and_expiry`, `set_status_requires_compliance_auth` |
| 12 | `kyc_registry.revoke` | Revoca el KYC; el comercio ya no puede crear links | [927e59e0…](https://stellar.expert/explorer/testnet/tx/927e59e08d1f9937448435c66dbf22153741b7abb2e4a41a680ca778b44cee13) | `revoke_works` |

Las funciones de configuración (`init`, `set_fee`, `set_treasury`, `allow_token`, `set_escrow_window`, `set_compliance`, `pause`/`unpause`) y de lectura (`get`, `is_verified`, `get_config`, `is_token_allowed`) no se cuentan.

### Comprobación de saldos tras el script
Cliente recibió 5 000 MXNe y pagó 1 500 (más 200 reembolsados) → **3 500**. Tesorería: 0.9% de 1 500 → **13.5**. Comercio: **1 486.5**. El indexer decodificó los 24 eventos emitidos sin ninguno desconocido.

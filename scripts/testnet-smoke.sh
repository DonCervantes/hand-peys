#!/usr/bin/env bash
# Ejercita en testnet cada función pública que cambia estado y guarda el hash de la tx.
# Requiere: deployments/testnet.json y llaves hp-deployer (admin/emisor), hp-compliance, hp-treasury.
# Uso: bash scripts/testnet-smoke.sh  → escribe deployments/testnet-txs.json
set -euo pipefail
cd "$(dirname "$0")/.."
N=testnet
D=deployments/testnet.json
j() { node -e "console.log(require('./$D').$1)"; }
KYC=$(j contracts.kyc_registry); FS=$(j contracts.fee_splitter); PL=$(j contracts.payment_link); ES=$(j contracts.escrow)
MXNE=$(j tokens.MXNE.contractId); ASSET=$(j tokens.MXNE.asset)
OUT=deployments/testnet-txs.json
echo "{" > "$OUT.tmp"

key() { stellar keys address "$1" 2>/dev/null || { stellar keys generate "$1" --network $N --fund >/dev/null 2>&1; stellar keys address "$1"; }; }
# invoca y registra: rec <etiqueta> <id> <source> -- fn args...
rec() {
  local label=$1 id=$2 src=$3; shift 4
  local out; out=$(stellar contract invoke --id "$id" --source "$src" --network $N --send=yes -- "$@" 2>&1) || { echo "$out"; exit 1; }
  local hash; hash=$(echo "$out" | grep -oE 'tx/[0-9a-f]{64}' | tail -1 | cut -d/ -f2)
  echo "✔ $label  $hash"
  echo "  \"$label\": \"$hash\"," >> "$OUT.tmp"
}
trust() { stellar tx new change-trust --source "$1" --line "$ASSET" --network $N >/dev/null 2>&1 || true; }
newid() { node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"; }

MER=$(key hp-merchant); PAY=$(key hp-payer); OTHER=$(key hp-revoked)
TRE=$(j treasury)
for k in hp-merchant hp-payer hp-treasury; do trust $k; done

YEAR=$(( $(date +%s) + 31536000 ))
REF=$(node -e "console.log(require('crypto').createHash('sha256').update('didit-demo-ref').digest('hex'))")
U=10000000   # 1 MXNe = 10^7

rec mint_mxne "$MXNE" hp-deployer -- mint --to "$PAY" --amount $((5000*U))

# kyc_registry
rec kyc_registry.set_status "$KYC" hp-compliance -- set_status --addr "$MER" --level 1 --expires_at $YEAR --ref_hash "$REF"
rec kyc_registry.set_status_other "$KYC" hp-compliance -- set_status --addr "$OTHER" --level 1 --expires_at $YEAR --ref_hash "$REF"
rec kyc_registry.revoke "$KYC" hp-compliance -- revoke --addr "$OTHER"

# fee_splitter (llamada directa)
rec fee_splitter.split "$FS" hp-payer -- split --token "$MXNE" --from "$PAY" --to "$MER" --amount $((100*U))

# payment_link: directo
L1=$(newid)
rec payment_link.create_link "$PL" hp-merchant -- create_link --merchant "$MER" --id "$L1" --token "$MXNE" --amount $((350*U)) --mode 0 --expires_at 0
rec payment_link.pay "$PL" hp-payer -- pay --id "$L1" --payer "$PAY"

# payment_link: cancel
L2=$(newid)
rec payment_link.create_link_2 "$PL" hp-merchant -- create_link --merchant "$MER" --id "$L2" --token "$MXNE" --amount $((120*U)) --mode 0 --expires_at 0
rec payment_link.cancel "$PL" hp-merchant -- cancel --id "$L2"

# escrow: confirm
L3=$(newid)
rec payment_link.create_link_escrow "$PL" hp-merchant -- create_link --merchant "$MER" --id "$L3" --token "$MXNE" --amount $((500*U)) --mode 1 --expires_at 0
rec payment_link.pay_escrow_hold "$PL" hp-payer -- pay --id "$L3" --payer "$PAY"
rec escrow.confirm "$ES" hp-payer -- confirm --id "$L3"

# escrow: refund
L4=$(newid)
rec payment_link.create_link_escrow_2 "$PL" hp-merchant -- create_link --merchant "$MER" --id "$L4" --token "$MXNE" --amount $((200*U)) --mode 1 --expires_at 0
rec payment_link.pay_escrow_2 "$PL" hp-payer -- pay --id "$L4" --payer "$PAY"
rec escrow.refund "$ES" hp-merchant -- refund --id "$L4"

# escrow: dispute + resolve
L5=$(newid)
rec payment_link.create_link_escrow_3 "$PL" hp-merchant -- create_link --merchant "$MER" --id "$L5" --token "$MXNE" --amount $((300*U)) --mode 1 --expires_at 0
rec payment_link.pay_escrow_3 "$PL" hp-payer -- pay --id "$L5" --payer "$PAY"
rec escrow.dispute "$ES" hp-payer -- dispute --id "$L5"
rec escrow.resolve "$ES" hp-compliance -- resolve --id "$L5" --to_merchant true

# escrow: claim tras la ventana (ventana temporal de 30 s, luego se restaura)
rec payment_link.set_escrow_window_30s "$PL" hp-deployer -- set_escrow_window --secs 30
L6=$(newid)
rec payment_link.create_link_escrow_4 "$PL" hp-merchant -- create_link --merchant "$MER" --id "$L6" --token "$MXNE" --amount $((250*U)) --mode 1 --expires_at 0
rec payment_link.pay_escrow_4 "$PL" hp-payer -- pay --id "$L6" --payer "$PAY"
rec payment_link.set_escrow_window_restore "$PL" hp-deployer -- set_escrow_window --secs $(j params.escrowWindowSecs)
echo "… esperando 40 s a que venza la ventana"; sleep 40
rec escrow.claim "$ES" hp-merchant -- claim --id "$L6"

sed -i '$ s/,$//' "$OUT.tmp"; echo "}" >> "$OUT.tmp"; mv "$OUT.tmp" "$OUT"
echo; echo "Saldos MXNe: comercio / cliente / tesorería"
for a in "$MER" "$PAY" "$TRE"; do stellar contract invoke --id "$MXNE" --source hp-deployer --network $N --send=no -- balance --id "$a" 2>/dev/null; done
echo "✅ $OUT"

//! Integración: kyc_registry + fee_splitter + payment_link + escrow con un SAC real.
extern crate std;

use escrow::{Escrow, EscrowClient, EscrowStatus, Error as EscrowError};
use fee_splitter::{FeeSplitter, FeeSplitterClient};
use kyc_registry::{KycRegistry, KycRegistryClient};
use payment_link::{Error as LinkError, LinkStatus, PaymentLink, PaymentLinkClient, MODE_DIRECT, MODE_ESCROW};
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::token::{StellarAssetClient, TokenClient};
use soroban_sdk::{Address, BytesN, Env};

const WEEK: u64 = 7 * 24 * 3600;
/// $350 MXN en MXNe (7 decimales).
const AMOUNT: i128 = 350_0000000;

struct World<'a> {
    env: Env,
    kyc: KycRegistryClient<'a>,
    splitter: FeeSplitterClient<'a>,
    links: PaymentLinkClient<'a>,
    escrow: EscrowClient<'a>,
    mxne: Address,
    usdc: Address,
    treasury: Address,
    merchant: Address,
    payer: Address,
}

fn world<'a>() -> World<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_700_000_000);

    let admin = Address::generate(&env);
    let compliance = Address::generate(&env);
    let treasury = Address::generate(&env);
    let merchant = Address::generate(&env);
    let payer = Address::generate(&env);

    let mxne = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let usdc = env.register_stellar_asset_contract_v2(admin.clone()).address();

    let kyc_id = env.register(KycRegistry, ());
    let split_id = env.register(FeeSplitter, ());
    let link_id = env.register(PaymentLink, ());
    let escrow_id = env.register(Escrow, ());

    let kyc = KycRegistryClient::new(&env, &kyc_id);
    let splitter = FeeSplitterClient::new(&env, &split_id);
    let links = PaymentLinkClient::new(&env, &link_id);
    let escrow = EscrowClient::new(&env, &escrow_id);

    kyc.init(&admin, &compliance);
    splitter.init(&admin, &treasury, &90);
    links.init(&admin, &kyc_id, &split_id, &escrow_id, &WEEK);
    escrow.init(&admin, &compliance, &link_id, &split_id);
    links.allow_token(&mxne, &true);
    links.allow_token(&usdc, &true);

    StellarAssetClient::new(&env, &mxne).mint(&payer, &(10_000 * 10_000_000));
    StellarAssetClient::new(&env, &usdc).mint(&payer, &(1_000 * 10_000_000));

    World { env, kyc, splitter, links, escrow, mxne, usdc, treasury, merchant, payer }
}

fn verify(w: &World) {
    let exp = w.env.ledger().timestamp() + 365 * 24 * 3600;
    w.kyc.set_status(&w.merchant, &1, &exp, &BytesN::from_array(&w.env, &[1; 32]));
}

fn id(w: &World, n: u8) -> BytesN<16> {
    BytesN::from_array(&w.env, &[n; 16])
}

fn bal(w: &World, token: &Address, who: &Address) -> i128 {
    TokenClient::new(&w.env, token).balance(who)
}

#[test]
fn create_link_without_kyc_fails() {
    let w = world();
    let r = w.links.try_create_link(&w.merchant, &id(&w, 1), &w.mxne, &AMOUNT, &MODE_DIRECT, &0);
    assert_eq!(r, Err(Ok(LinkError::MerchantNotVerified)));
}

#[test]
fn expired_kyc_blocks_new_links() {
    let w = world();
    let exp = w.env.ledger().timestamp() + 10;
    w.kyc.set_status(&w.merchant, &1, &exp, &BytesN::from_array(&w.env, &[1; 32]));
    w.links.create_link(&w.merchant, &id(&w, 1), &w.mxne, &AMOUNT, &MODE_DIRECT, &0);
    w.env.ledger().set_timestamp(exp);
    let r = w.links.try_create_link(&w.merchant, &id(&w, 2), &w.mxne, &AMOUNT, &MODE_DIRECT, &0);
    assert_eq!(r, Err(Ok(LinkError::MerchantNotVerified)));
}

#[test]
fn direct_payment_splits_fee() {
    let w = world();
    verify(&w);
    let lid = id(&w, 1);
    w.links.create_link(&w.merchant, &lid, &w.mxne, &AMOUNT, &MODE_DIRECT, &0);
    let before = bal(&w, &w.mxne, &w.payer);
    w.links.pay(&lid, &w.payer);

    let fee = AMOUNT * 90 / 10_000; // $3.15
    assert_eq!(bal(&w, &w.mxne, &w.merchant), AMOUNT - fee);
    assert_eq!(bal(&w, &w.mxne, &w.treasury), fee);
    assert_eq!(bal(&w, &w.mxne, &w.payer), before - AMOUNT);

    let link = w.links.get(&lid).unwrap();
    assert_eq!(link.status, LinkStatus::Paid);
    assert_eq!(link.payer, Some(w.payer.clone()));
}

#[test]
fn usdc_payment_works() {
    let w = world();
    verify(&w);
    let lid = id(&w, 9);
    w.links.create_link(&w.merchant, &lid, &w.usdc, &10_000_000, &MODE_DIRECT, &0);
    w.links.pay(&lid, &w.payer);
    assert_eq!(bal(&w, &w.usdc, &w.merchant), 9_910_000);
}

#[test]
fn double_payment_fails() {
    let w = world();
    verify(&w);
    let lid = id(&w, 1);
    w.links.create_link(&w.merchant, &lid, &w.mxne, &AMOUNT, &MODE_DIRECT, &0);
    w.links.pay(&lid, &w.payer);
    assert_eq!(w.links.try_pay(&lid, &w.payer), Err(Ok(LinkError::NotOpen)));
}

#[test]
fn duplicate_id_fails() {
    let w = world();
    verify(&w);
    let lid = id(&w, 1);
    w.links.create_link(&w.merchant, &lid, &w.mxne, &AMOUNT, &MODE_DIRECT, &0);
    let r = w.links.try_create_link(&w.merchant, &lid, &w.mxne, &AMOUNT, &MODE_DIRECT, &0);
    assert_eq!(r, Err(Ok(LinkError::AlreadyExists)));
}

#[test]
fn expiration_and_validation() {
    let w = world();
    verify(&w);
    let now = w.env.ledger().timestamp();
    assert_eq!(
        w.links.try_create_link(&w.merchant, &id(&w, 1), &w.mxne, &AMOUNT, &MODE_DIRECT, &now),
        Err(Ok(LinkError::InvalidExpiry))
    );
    assert_eq!(
        w.links.try_create_link(&w.merchant, &id(&w, 1), &w.mxne, &0, &MODE_DIRECT, &0),
        Err(Ok(LinkError::InvalidAmount))
    );
    assert_eq!(
        w.links.try_create_link(&w.merchant, &id(&w, 1), &w.mxne, &AMOUNT, &7, &0),
        Err(Ok(LinkError::InvalidMode))
    );
    let lid = id(&w, 2);
    w.links.create_link(&w.merchant, &lid, &w.mxne, &AMOUNT, &MODE_DIRECT, &(now + 60));
    w.env.ledger().set_timestamp(now + 60);
    assert_eq!(w.links.try_pay(&lid, &w.payer), Err(Ok(LinkError::Expired)));
}

#[test]
fn token_whitelist_enforced() {
    let w = world();
    verify(&w);
    let other = w.env.register_stellar_asset_contract_v2(Address::generate(&w.env)).address();
    assert_eq!(
        w.links.try_create_link(&w.merchant, &id(&w, 1), &other, &AMOUNT, &MODE_DIRECT, &0),
        Err(Ok(LinkError::TokenNotAllowed))
    );
}

#[test]
fn cancel_then_pay_fails() {
    let w = world();
    verify(&w);
    let lid = id(&w, 1);
    w.links.create_link(&w.merchant, &lid, &w.mxne, &AMOUNT, &MODE_DIRECT, &0);
    w.links.cancel(&lid);
    assert_eq!(w.links.try_pay(&lid, &w.payer), Err(Ok(LinkError::NotOpen)));
}

#[test]
fn self_payment_rejected() {
    let w = world();
    verify(&w);
    let lid = id(&w, 1);
    w.links.create_link(&w.merchant, &lid, &w.mxne, &AMOUNT, &MODE_DIRECT, &0);
    assert_eq!(w.links.try_pay(&lid, &w.merchant), Err(Ok(LinkError::SelfPayment)));
}

#[test]
fn fee_change_applies_to_next_payment() {
    let w = world();
    verify(&w);
    w.splitter.set_fee(&0);
    let lid = id(&w, 1);
    w.links.create_link(&w.merchant, &lid, &w.mxne, &AMOUNT, &MODE_DIRECT, &0);
    w.links.pay(&lid, &w.payer);
    assert_eq!(bal(&w, &w.mxne, &w.merchant), AMOUNT);
}

// ---------- Modo con garantía ----------

fn escrow_paid(w: &World) -> BytesN<16> {
    verify(w);
    let lid = id(w, 5);
    w.links.create_link(&w.merchant, &lid, &w.mxne, &AMOUNT, &MODE_ESCROW, &0);
    w.links.pay(&lid, &w.payer);
    assert_eq!(bal(w, &w.mxne, &w.escrow.address), AMOUNT);
    assert_eq!(w.escrow.get(&lid).unwrap().status, EscrowStatus::Held);
    lid
}

#[test]
fn escrow_confirm_releases_with_fee() {
    let w = world();
    let lid = escrow_paid(&w);
    let net = w.escrow.confirm(&lid);
    let fee = AMOUNT * 90 / 10_000;
    assert_eq!(net, AMOUNT - fee);
    assert_eq!(bal(&w, &w.mxne, &w.merchant), AMOUNT - fee);
    assert_eq!(bal(&w, &w.mxne, &w.treasury), fee);
    assert_eq!(bal(&w, &w.mxne, &w.escrow.address), 0);
    assert_eq!(w.escrow.try_confirm(&lid), Err(Ok(EscrowError::InvalidState)));
}

#[test]
fn escrow_refund_is_free() {
    let w = world();
    let before = bal(&w, &w.mxne, &w.payer);
    let lid = escrow_paid(&w);
    w.escrow.refund(&lid);
    assert_eq!(bal(&w, &w.mxne, &w.payer), before);
    assert_eq!(bal(&w, &w.mxne, &w.treasury), 0);
    assert_eq!(w.escrow.get(&lid).unwrap().status, EscrowStatus::Refunded);
}

#[test]
fn escrow_claim_after_window() {
    let w = world();
    let lid = escrow_paid(&w);
    assert_eq!(w.escrow.try_claim(&lid), Err(Ok(EscrowError::TooEarly)));
    w.env.ledger().set_timestamp(w.env.ledger().timestamp() + WEEK);
    w.escrow.claim(&lid);
    assert_eq!(bal(&w, &w.mxne, &w.merchant), AMOUNT - AMOUNT * 90 / 10_000);
}

#[test]
fn escrow_dispute_blocks_claim_and_resolves() {
    let w = world();
    let lid = escrow_paid(&w);
    w.escrow.dispute(&lid);
    w.env.ledger().set_timestamp(w.env.ledger().timestamp() + WEEK);
    assert_eq!(w.escrow.try_claim(&lid), Err(Ok(EscrowError::InvalidState)));
    w.escrow.resolve(&lid, &false);
    assert_eq!(bal(&w, &w.mxne, &w.merchant), 0);
    assert_eq!(bal(&w, &w.mxne, &w.escrow.address), 0);
    assert_eq!(w.escrow.get(&lid).unwrap().status, EscrowStatus::Resolved);
}

#[test]
fn escrow_resolve_to_merchant() {
    let w = world();
    let lid = escrow_paid(&w);
    w.escrow.dispute(&lid);
    w.escrow.resolve(&lid, &true);
    assert_eq!(bal(&w, &w.mxne, &w.merchant), AMOUNT - AMOUNT * 90 / 10_000);
}

#[test]
#[should_panic]
fn escrow_hold_only_from_link_contract() {
    let w = world();
    // Sin mock de auth: solo payment_link puede invocar hold.
    w.env.set_auths(&[]);
    w.escrow.hold(&id(&w, 3), &w.payer, &w.merchant, &w.mxne, &AMOUNT, &0);
}

#[test]
fn pause_blocks_payments() {
    let w = world();
    verify(&w);
    let lid = id(&w, 1);
    w.links.create_link(&w.merchant, &lid, &w.mxne, &AMOUNT, &MODE_DIRECT, &0);
    w.links.pause();
    assert_eq!(w.links.try_pay(&lid, &w.payer), Err(Ok(LinkError::Paused)));
    w.links.unpause();
    w.links.pay(&lid, &w.payer);
}

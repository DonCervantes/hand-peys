#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::token::{StellarAssetClient, TokenClient};

struct Setup<'a> {
    env: Env,
    client: FeeSplitterClient<'a>,
    token: Address,
    treasury: Address,
}

fn setup<'a>(fee_bps: u32) -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let id = env.register(FeeSplitter, ());
    let client = FeeSplitterClient::new(&env, &id);
    client.init(&admin, &treasury, &fee_bps);
    Setup { env, client, token: sac.address(), treasury }
}

fn mint(env: &Env, token: &Address, to: &Address, amount: i128) {
    StellarAssetClient::new(env, token).mint(to, &amount);
}

#[test]
fn compute_fee_rounds_in_favor_of_merchant() {
    assert_eq!(compute_fee(10_000, 90), 90);
    assert_eq!(compute_fee(111, 90), 0); // 0.999 -> 0
    assert_eq!(compute_fee(1_112, 90), 10); // 10.008 -> 10
    assert_eq!(compute_fee(350_0000000, 90), 3_1500000); // $350 MXNe (7 dec) -> $3.15
}

#[test]
fn split_sends_net_and_fee() {
    let s = setup(90);
    let payer = Address::generate(&s.env);
    let merchant = Address::generate(&s.env);
    mint(&s.env, &s.token, &payer, 1_000_000);
    let (net, fee) = s.client.split(&s.token, &payer, &merchant, &1_000_000);
    assert_eq!((net, fee), (991_000, 9_000));
    assert_eq!(s.env.auths()[0].0, payer);
    let tk = TokenClient::new(&s.env, &s.token);
    assert_eq!(tk.balance(&merchant), 991_000);
    assert_eq!(tk.balance(&s.treasury), 9_000);
    assert_eq!(tk.balance(&payer), 0);
}

#[test]
fn zero_fee_skips_treasury() {
    let s = setup(0);
    let payer = Address::generate(&s.env);
    let merchant = Address::generate(&s.env);
    mint(&s.env, &s.token, &payer, 500);
    assert_eq!(s.client.split(&s.token, &payer, &merchant, &500), (500, 0));
}

#[test]
fn fee_limits() {
    let s = setup(90);
    assert_eq!(s.client.try_set_fee(&301), Err(Ok(Error::FeeTooHigh)));
    s.client.set_fee(&300);
    assert_eq!(s.client.get_config().fee_bps, 300);

    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(FeeSplitter, ());
    let c = FeeSplitterClient::new(&env, &id);
    let a = Address::generate(&env);
    assert_eq!(c.try_init(&a, &a, &500), Err(Ok(Error::FeeTooHigh)));
}

#[test]
fn invalid_amount() {
    let s = setup(90);
    let a = Address::generate(&s.env);
    assert_eq!(
        s.client.try_split(&s.token, &a, &a, &0),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        s.client.try_split(&s.token, &a, &a, &-5),
        Err(Ok(Error::InvalidAmount))
    );
}

#[test]
fn paused_blocks_split() {
    let s = setup(90);
    let a = Address::generate(&s.env);
    s.client.pause();
    assert_eq!(s.client.try_split(&s.token, &a, &a, &10), Err(Ok(Error::Paused)));
}

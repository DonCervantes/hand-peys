#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};

struct Setup<'a> {
    env: Env,
    client: KycRegistryClient<'a>,
    admin: Address,
    compliance: Address,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);
    let id = env.register(KycRegistry, ());
    let client = KycRegistryClient::new(&env, &id);
    let admin = Address::generate(&env);
    let compliance = Address::generate(&env);
    client.init(&admin, &compliance);
    Setup { env, client, admin, compliance }
}

fn hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[7u8; 32])
}

#[test]
fn init_twice_fails() {
    let s = setup();
    let r = s.client.try_init(&s.admin, &s.compliance);
    assert_eq!(r, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn set_status_and_verify() {
    let s = setup();
    let m = Address::generate(&s.env);
    assert!(!s.client.is_verified(&m));
    s.client.set_status(&m, &LEVEL_BASIC, &5_000, &hash(&s.env));
    assert!(s.client.is_verified(&m));
    let rec = s.client.get(&m).unwrap();
    assert_eq!(rec.level, 1);
    assert_eq!(rec.expires_at, 5_000);
}

#[test]
fn set_status_requires_compliance_auth() {
    let s = setup();
    let m = Address::generate(&s.env);
    s.client.set_status(&m, &LEVEL_FULL, &5_000, &hash(&s.env));
    let auths = s.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, s.compliance);
}

#[test]
#[should_panic]
fn set_status_without_auth_panics() {
    let env = Env::default();
    let id = env.register(KycRegistry, ());
    let client = KycRegistryClient::new(&env, &id);
    let admin = Address::generate(&env);
    let compliance = Address::generate(&env);
    env.mock_all_auths();
    client.init(&admin, &compliance);
    env.set_auths(&[]); // sin firmas
    let m = Address::generate(&env);
    client.set_status(&m, &1, &5_000, &BytesN::from_array(&env, &[0; 32]));
}

#[test]
fn level_zero_is_not_verified() {
    let s = setup();
    let m = Address::generate(&s.env);
    s.client.set_status(&m, &LEVEL_NONE, &5_000, &hash(&s.env));
    assert!(!s.client.is_verified(&m));
}

#[test]
fn invalid_level_and_expiry() {
    let s = setup();
    let m = Address::generate(&s.env);
    assert_eq!(
        s.client.try_set_status(&m, &3, &5_000, &hash(&s.env)),
        Err(Ok(Error::InvalidLevel))
    );
    assert_eq!(
        s.client.try_set_status(&m, &1, &1_000, &hash(&s.env)),
        Err(Ok(Error::InvalidExpiry))
    );
}

#[test]
fn expiration_unverifies() {
    let s = setup();
    let m = Address::generate(&s.env);
    s.client.set_status(&m, &LEVEL_BASIC, &2_000, &hash(&s.env));
    assert!(s.client.is_verified(&m));
    s.env.ledger().set_timestamp(2_000);
    assert!(!s.client.is_verified(&m));
}

#[test]
fn revoke_works() {
    let s = setup();
    let m = Address::generate(&s.env);
    assert_eq!(s.client.try_revoke(&m), Err(Ok(Error::NotFound)));
    s.client.set_status(&m, &LEVEL_BASIC, &5_000, &hash(&s.env));
    s.client.revoke(&m);
    assert!(!s.client.is_verified(&m));
    assert_eq!(s.client.get(&m), None);
}

#[test]
fn pause_blocks_set_status() {
    let s = setup();
    let m = Address::generate(&s.env);
    s.client.pause();
    assert_eq!(
        s.client.try_set_status(&m, &1, &5_000, &hash(&s.env)),
        Err(Ok(Error::Paused))
    );
    s.client.unpause();
    s.client.set_status(&m, &1, &5_000, &hash(&s.env));
}

#[test]
fn rotate_compliance() {
    let s = setup();
    let new_c = Address::generate(&s.env);
    s.client.set_compliance(&new_c);
    assert_eq!(s.env.auths()[0].0, s.admin);
    assert_eq!(s.client.compliance(), new_c);
}

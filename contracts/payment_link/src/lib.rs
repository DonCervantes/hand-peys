#![no_std]
#![allow(deprecated)]
//! # payment_link
//!
//! Links de cobro de Hand Peys. Regla de oro: **solo un comercio con
//! `kyc_registry.is_verified(owner) == true` puede crear links** (se valida
//! aquí, on-chain). Cada link se paga una sola vez, respeta su expiración y
//! solo acepta tokens de la whitelist (MXNe y USDC).

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, Address, BytesN, Env,
    Symbol,
};

const DAY_LEDGERS: u32 = 17_280;
const TTL_THRESHOLD: u32 = 7 * DAY_LEDGERS;
const TTL_EXTEND: u32 = 30 * DAY_LEDGERS;

pub const MODE_DIRECT: u32 = 0;
pub const MODE_ESCROW: u32 = 1;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Paused = 3,
    MerchantNotVerified = 4,
    TokenNotAllowed = 5,
    InvalidAmount = 6,
    InvalidMode = 7,
    InvalidExpiry = 8,
    AlreadyExists = 9,
    NotFound = 10,
    NotOpen = 11,
    Expired = 12,
    SelfPayment = 13,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum LinkStatus {
    Open = 0,
    Paid = 1,
    Cancelled = 2,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Link {
    pub merchant: Address,
    pub token: Address,
    pub amount: i128,
    pub mode: u32,
    pub expires_at: u64,
    pub status: LinkStatus,
    pub payer: Option<Address>,
    pub paid_at: u64,
}

#[contractclient(name = "KycClient")]
pub trait KycInterface {
    fn is_verified(env: Env, addr: Address) -> bool;
}

#[contractclient(name = "SplitClient")]
pub trait SplitInterface {
    fn split(env: Env, token: Address, from: Address, to: Address, amount: i128) -> (i128, i128);
}

#[contractclient(name = "HoldClient")]
pub trait HoldInterface {
    fn hold(
        env: Env,
        id: BytesN<16>,
        payer: Address,
        merchant: Address,
        token: Address,
        amount: i128,
        release_after: u64,
    );
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Kyc,
    Splitter,
    Escrow,
    EscrowWindow,
    Paused,
    Token(Address),
    Link(BytesN<16>),
}

#[contract]
pub struct PaymentLink;

fn get_addr(env: &Env, key: &DataKey) -> Result<Address, Error> {
    env.storage().instance().get(key).ok_or(Error::NotInitialized)
}

fn ensure_not_paused(env: &Env) -> Result<(), Error> {
    if env.storage().instance().get(&DataKey::Paused).unwrap_or(false) {
        return Err(Error::Paused);
    }
    Ok(())
}

fn load(env: &Env, id: &BytesN<16>) -> Result<Link, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Link(id.clone()))
        .ok_or(Error::NotFound)
}

fn save(env: &Env, id: &BytesN<16>, link: &Link) {
    let key = DataKey::Link(id.clone());
    env.storage().persistent().set(&key, link);
    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

#[contractimpl]
impl PaymentLink {
    pub fn init(
        env: Env,
        admin: Address,
        kyc: Address,
        splitter: Address,
        escrow: Address,
        escrow_window_secs: u64,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::Kyc, &kyc);
        s.set(&DataKey::Splitter, &splitter);
        s.set(&DataKey::Escrow, &escrow);
        s.set(&DataKey::EscrowWindow, &escrow_window_secs);
        s.set(&DataKey::Paused, &false);
        s.extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        Ok(())
    }

    /// Agrega/quita un token (SAC de MXNe o USDC) de la whitelist.
    pub fn allow_token(env: Env, token: Address, allowed: bool) -> Result<(), Error> {
        get_addr(&env, &DataKey::Admin)?.require_auth();
        env.storage().instance().set(&DataKey::Token(token), &allowed);
        Ok(())
    }

    pub fn is_token_allowed(env: Env, token: Address) -> bool {
        env.storage().instance().get(&DataKey::Token(token)).unwrap_or(false)
    }

    /// Crea un link. `expires_at = 0` significa sin expiración.
    pub fn create_link(
        env: Env,
        merchant: Address,
        id: BytesN<16>,
        token: Address,
        amount: i128,
        mode: u32,
        expires_at: u64,
    ) -> Result<(), Error> {
        ensure_not_paused(&env)?;
        merchant.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if mode != MODE_DIRECT && mode != MODE_ESCROW {
            return Err(Error::InvalidMode);
        }
        if expires_at != 0 && expires_at <= env.ledger().timestamp() {
            return Err(Error::InvalidExpiry);
        }
        if !Self::is_token_allowed(env.clone(), token.clone()) {
            return Err(Error::TokenNotAllowed);
        }
        if env.storage().persistent().has(&DataKey::Link(id.clone())) {
            return Err(Error::AlreadyExists);
        }
        let kyc = get_addr(&env, &DataKey::Kyc)?;
        if !KycClient::new(&env, &kyc).is_verified(&merchant) {
            return Err(Error::MerchantNotVerified);
        }
        let link = Link {
            merchant: merchant.clone(),
            token,
            amount,
            mode,
            expires_at,
            status: LinkStatus::Open,
            payer: None,
            paid_at: 0,
        };
        save(&env, &id, &link);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        env.events().publish(
            (Symbol::new(&env, "link_created"), id, merchant),
            (amount, mode),
        );
        Ok(())
    }

    /// Paga un link. Modo directo → fee_splitter; modo garantía → escrow.
    pub fn pay(env: Env, id: BytesN<16>, payer: Address) -> Result<(), Error> {
        ensure_not_paused(&env)?;
        payer.require_auth();
        let mut link = load(&env, &id)?;
        if link.status != LinkStatus::Open {
            return Err(Error::NotOpen);
        }
        let now = env.ledger().timestamp();
        if link.expires_at != 0 && now >= link.expires_at {
            return Err(Error::Expired);
        }
        if payer == link.merchant {
            return Err(Error::SelfPayment);
        }
        // Efectos antes de interacciones.
        link.status = LinkStatus::Paid;
        link.payer = Some(payer.clone());
        link.paid_at = now;
        save(&env, &id, &link);

        if link.mode == MODE_DIRECT {
            let splitter = get_addr(&env, &DataKey::Splitter)?;
            SplitClient::new(&env, &splitter).split(&link.token, &payer, &link.merchant, &link.amount);
        } else {
            let escrow = get_addr(&env, &DataKey::Escrow)?;
            let window: u64 = env.storage().instance().get(&DataKey::EscrowWindow).unwrap_or(0);
            HoldClient::new(&env, &escrow).hold(
                &id,
                &payer,
                &link.merchant,
                &link.token,
                &link.amount,
                &(now + window),
            );
        }
        env.events().publish(
            (Symbol::new(&env, "link_paid"), id, link.merchant),
            (payer, link.amount),
        );
        Ok(())
    }

    pub fn cancel(env: Env, id: BytesN<16>) -> Result<(), Error> {
        let mut link = load(&env, &id)?;
        link.merchant.require_auth();
        if link.status != LinkStatus::Open {
            return Err(Error::NotOpen);
        }
        link.status = LinkStatus::Cancelled;
        save(&env, &id, &link);
        env.events()
            .publish((Symbol::new(&env, "link_cancelled"), id, link.merchant), ());
        Ok(())
    }

    pub fn get(env: Env, id: BytesN<16>) -> Option<Link> {
        env.storage().persistent().get(&DataKey::Link(id))
    }

    pub fn set_escrow_window(env: Env, secs: u64) -> Result<(), Error> {
        get_addr(&env, &DataKey::Admin)?.require_auth();
        env.storage().instance().set(&DataKey::EscrowWindow, &secs);
        Ok(())
    }

    pub fn pause(env: Env) -> Result<(), Error> {
        get_addr(&env, &DataKey::Admin)?.require_auth();
        env.storage().instance().set(&DataKey::Paused, &true);
        Ok(())
    }

    pub fn unpause(env: Env) -> Result<(), Error> {
        get_addr(&env, &DataKey::Admin)?.require_auth();
        env.storage().instance().set(&DataKey::Paused, &false);
        Ok(())
    }

    pub fn upgrade(env: Env, wasm_hash: BytesN<32>) -> Result<(), Error> {
        get_addr(&env, &DataKey::Admin)?.require_auth();
        env.deployer().update_current_contract_wasm(wasm_hash);
        Ok(())
    }
}

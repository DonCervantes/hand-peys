#![no_std]
#![allow(deprecated)]
//! # escrow
//!
//! Modo **"Con garantía"**: el dinero del cliente queda retenido hasta que
//! confirma la entrega (`confirm`), el comercio reembolsa (`refund`), pasa el
//! plazo y el comercio reclama (`claim`), o cumplimiento resuelve una disputa.
//! La comisión se cobra **solo al liberar** al comercio, nunca al reembolsar.

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, token, Address, BytesN,
    Env, Symbol,
};

const DAY_LEDGERS: u32 = 17_280;
const TTL_THRESHOLD: u32 = 7 * DAY_LEDGERS;
const TTL_EXTEND: u32 = 30 * DAY_LEDGERS;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Paused = 3,
    AlreadyExists = 4,
    NotFound = 5,
    InvalidState = 6,
    TooEarly = 7,
    InvalidAmount = 8,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum EscrowStatus {
    Held = 0,
    Released = 1,
    Refunded = 2,
    Disputed = 3,
    Resolved = 4,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Hold {
    pub payer: Address,
    pub merchant: Address,
    pub token: Address,
    pub amount: i128,
    pub release_after: u64,
    pub status: EscrowStatus,
}

/// Misma forma que `fee_splitter::FeeConfig` (XDR estructural).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SplitterConfig {
    pub treasury: Address,
    pub fee_bps: u32,
}

#[contractclient(name = "SplitterClient")]
pub trait SplitterInterface {
    fn get_config(env: Env) -> SplitterConfig;
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Compliance,
    LinkContract,
    Splitter,
    Paused,
    Hold(BytesN<16>),
}

#[contract]
pub struct Escrow;

fn get_addr(env: &Env, key: &DataKey) -> Result<Address, Error> {
    env.storage().instance().get(key).ok_or(Error::NotInitialized)
}

fn load(env: &Env, id: &BytesN<16>) -> Result<Hold, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Hold(id.clone()))
        .ok_or(Error::NotFound)
}

fn save(env: &Env, id: &BytesN<16>, h: &Hold) {
    let key = DataKey::Hold(id.clone());
    env.storage().persistent().set(&key, h);
    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

fn ensure_not_paused(env: &Env) -> Result<(), Error> {
    if env.storage().instance().get(&DataKey::Paused).unwrap_or(false) {
        return Err(Error::Paused);
    }
    Ok(())
}

fn emit(env: &Env, name: &str, id: &BytesN<16>, amount: i128) {
    env.events()
        .publish((Symbol::new(env, name), id.clone()), amount);
}

/// Paga al comercio descontando la comisión (truncada, a favor del comercio).
fn release_to_merchant(env: &Env, h: &Hold) -> Result<(i128, i128), Error> {
    let splitter = get_addr(env, &DataKey::Splitter)?;
    let cfg = SplitterClient::new(env, &splitter).get_config();
    let fee = h.amount * (cfg.fee_bps as i128) / 10_000;
    let net = h.amount - fee;
    let tk = token::Client::new(env, &h.token);
    let me = env.current_contract_address();
    tk.transfer(&me, &h.merchant, &net);
    if fee > 0 {
        tk.transfer(&me, &cfg.treasury, &fee);
    }
    Ok((net, fee))
}

fn refund_to_payer(env: &Env, h: &Hold) {
    token::Client::new(env, &h.token).transfer(&env.current_contract_address(), &h.payer, &h.amount);
}

#[contractimpl]
impl Escrow {
    pub fn init(
        env: Env,
        admin: Address,
        compliance: Address,
        link_contract: Address,
        splitter: Address,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::Compliance, &compliance);
        s.set(&DataKey::LinkContract, &link_contract);
        s.set(&DataKey::Splitter, &splitter);
        s.set(&DataKey::Paused, &false);
        s.extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        Ok(())
    }

    /// Retiene `amount` del `payer`. Solo lo puede invocar el contrato `payment_link`.
    pub fn hold(
        env: Env,
        id: BytesN<16>,
        payer: Address,
        merchant: Address,
        token: Address,
        amount: i128,
        release_after: u64,
    ) -> Result<(), Error> {
        ensure_not_paused(&env)?;
        get_addr(&env, &DataKey::LinkContract)?.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if env.storage().persistent().has(&DataKey::Hold(id.clone())) {
            return Err(Error::AlreadyExists);
        }
        token::Client::new(&env, &token).transfer(&payer, env.current_contract_address(), &amount);
        let h = Hold { payer, merchant, token, amount, release_after, status: EscrowStatus::Held };
        save(&env, &id, &h);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        emit(&env, "held", &id, amount);
        Ok(())
    }

    /// El cliente confirma la entrega → se libera al comercio (menos comisión).
    pub fn confirm(env: Env, id: BytesN<16>) -> Result<i128, Error> {
        ensure_not_paused(&env)?;
        let mut h = load(&env, &id)?;
        h.payer.require_auth();
        if h.status != EscrowStatus::Held {
            return Err(Error::InvalidState);
        }
        h.status = EscrowStatus::Released;
        save(&env, &id, &h);
        let (net, _) = release_to_merchant(&env, &h)?;
        emit(&env, "released", &id, net);
        Ok(net)
    }

    /// El comercio reembolsa al cliente (sin comisión). Válido en Held o Disputed.
    pub fn refund(env: Env, id: BytesN<16>) -> Result<(), Error> {
        ensure_not_paused(&env)?;
        let mut h = load(&env, &id)?;
        h.merchant.require_auth();
        if h.status != EscrowStatus::Held && h.status != EscrowStatus::Disputed {
            return Err(Error::InvalidState);
        }
        h.status = EscrowStatus::Refunded;
        save(&env, &id, &h);
        refund_to_payer(&env, &h);
        emit(&env, "refunded", &id, h.amount);
        Ok(())
    }

    /// El cliente abre una disputa (congela el `claim`).
    pub fn dispute(env: Env, id: BytesN<16>) -> Result<(), Error> {
        ensure_not_paused(&env)?;
        let mut h = load(&env, &id)?;
        h.payer.require_auth();
        if h.status != EscrowStatus::Held {
            return Err(Error::InvalidState);
        }
        h.status = EscrowStatus::Disputed;
        save(&env, &id, &h);
        emit(&env, "disputed", &id, h.amount);
        Ok(())
    }

    /// Cumplimiento resuelve la disputa a favor del comercio o del cliente.
    pub fn resolve(env: Env, id: BytesN<16>, to_merchant: bool) -> Result<(), Error> {
        get_addr(&env, &DataKey::Compliance)?.require_auth();
        let mut h = load(&env, &id)?;
        if h.status != EscrowStatus::Disputed {
            return Err(Error::InvalidState);
        }
        h.status = EscrowStatus::Resolved;
        save(&env, &id, &h);
        if to_merchant {
            release_to_merchant(&env, &h)?;
        } else {
            refund_to_payer(&env, &h);
        }
        emit(&env, "resolved", &id, if to_merchant { 1 } else { 0 });
        Ok(())
    }

    /// El comercio reclama después de `release_after` si no hubo disputa.
    pub fn claim(env: Env, id: BytesN<16>) -> Result<i128, Error> {
        ensure_not_paused(&env)?;
        let mut h = load(&env, &id)?;
        h.merchant.require_auth();
        if h.status != EscrowStatus::Held {
            return Err(Error::InvalidState);
        }
        if env.ledger().timestamp() < h.release_after {
            return Err(Error::TooEarly);
        }
        h.status = EscrowStatus::Released;
        save(&env, &id, &h);
        let (net, _) = release_to_merchant(&env, &h)?;
        emit(&env, "released", &id, net);
        Ok(net)
    }

    pub fn get(env: Env, id: BytesN<16>) -> Option<Hold> {
        env.storage().persistent().get(&DataKey::Hold(id))
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

#![no_std]
#![allow(deprecated)] // events().publish sigue siendo válido; migrar a #[contractevent] después.
//! # kyc_registry
//!
//! Registro on-chain del estado KYC de los comercios de Hand Peys.
//! **No guarda datos personales**: solo el nivel, la expiración y el hash de la
//! referencia de Pollar (Didit). La cuenta `compliance` es la única que escribe.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, BytesN, Env, Symbol,
};

const DAY_LEDGERS: u32 = 17_280;
const TTL_THRESHOLD: u32 = 7 * DAY_LEDGERS;
const TTL_EXTEND: u32 = 30 * DAY_LEDGERS;

pub const LEVEL_NONE: u32 = 0;
pub const LEVEL_BASIC: u32 = 1;
pub const LEVEL_FULL: u32 = 2;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Paused = 3,
    InvalidLevel = 4,
    InvalidExpiry = 5,
    NotFound = 6,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KycRecord {
    pub level: u32,
    pub expires_at: u64,
    pub ref_hash: BytesN<32>,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Compliance,
    Paused,
    Record(Address),
}

#[contract]
pub struct KycRegistry;

fn admin(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(Error::NotInitialized)
}

fn compliance(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Compliance)
        .ok_or(Error::NotInitialized)
}

fn ensure_not_paused(env: &Env) -> Result<(), Error> {
    if env.storage().instance().get(&DataKey::Paused).unwrap_or(false) {
        return Err(Error::Paused);
    }
    Ok(())
}

fn bump_instance(env: &Env) {
    env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
}

#[contractimpl]
impl KycRegistry {
    /// Inicializa el registro. `admin` = super_admin, `compliance` = oficial de cumplimiento.
    pub fn init(env: Env, admin: Address, compliance: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Compliance, &compliance);
        env.storage().instance().set(&DataKey::Paused, &false);
        bump_instance(&env);
        Ok(())
    }

    /// Escribe/actualiza el estado KYC de `addr`. Solo `compliance`.
    pub fn set_status(
        env: Env,
        addr: Address,
        level: u32,
        expires_at: u64,
        ref_hash: BytesN<32>,
    ) -> Result<(), Error> {
        ensure_not_paused(&env)?;
        compliance(&env)?.require_auth();
        if level > LEVEL_FULL {
            return Err(Error::InvalidLevel);
        }
        if expires_at <= env.ledger().timestamp() {
            return Err(Error::InvalidExpiry);
        }
        let key = DataKey::Record(addr.clone());
        let record = KycRecord { level, expires_at, ref_hash };
        env.storage().persistent().set(&key, &record);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
        bump_instance(&env);
        env.events()
            .publish((symbol_short!("kyc_set"), addr), (level, expires_at));
        Ok(())
    }

    /// Revoca el KYC de `addr`. Solo `compliance`.
    pub fn revoke(env: Env, addr: Address) -> Result<(), Error> {
        compliance(&env)?.require_auth();
        let key = DataKey::Record(addr.clone());
        if !env.storage().persistent().has(&key) {
            return Err(Error::NotFound);
        }
        env.storage().persistent().remove(&key);
        env.events().publish((Symbol::new(&env, "kyc_revoked"), addr), ());
        Ok(())
    }

    /// `true` si `addr` tiene nivel >= 1 y no ha expirado.
    pub fn is_verified(env: Env, addr: Address) -> bool {
        match env
            .storage()
            .persistent()
            .get::<DataKey, KycRecord>(&DataKey::Record(addr))
        {
            Some(r) => r.level >= LEVEL_BASIC && r.expires_at > env.ledger().timestamp(),
            None => false,
        }
    }

    pub fn get(env: Env, addr: Address) -> Option<KycRecord> {
        env.storage().persistent().get(&DataKey::Record(addr))
    }

    pub fn set_compliance(env: Env, new_compliance: Address) -> Result<(), Error> {
        admin(&env)?.require_auth();
        env.storage().instance().set(&DataKey::Compliance, &new_compliance);
        Ok(())
    }

    pub fn compliance(env: Env) -> Result<Address, Error> {
        compliance(&env)
    }

    pub fn pause(env: Env) -> Result<(), Error> {
        admin(&env)?.require_auth();
        env.storage().instance().set(&DataKey::Paused, &true);
        Ok(())
    }

    pub fn unpause(env: Env) -> Result<(), Error> {
        admin(&env)?.require_auth();
        env.storage().instance().set(&DataKey::Paused, &false);
        Ok(())
    }

    pub fn upgrade(env: Env, wasm_hash: BytesN<32>) -> Result<(), Error> {
        admin(&env)?.require_auth();
        env.deployer().update_current_contract_wasm(wasm_hash);
        Ok(())
    }
}

#[cfg(test)]
mod test;

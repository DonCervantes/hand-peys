#![no_std]
#![allow(deprecated)]
//! # fee_splitter
//!
//! Cobra la comisión de Hand Peys (`fee_bps`, inicial 90 = 0.9%) y manda el
//! resto al comercio. El redondeo es **a favor del comercio** (la comisión se
//! trunca hacia abajo). `fee_bps` nunca puede pasar de 300 (3%).

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, BytesN, Env, Symbol,
};

pub const MAX_FEE_BPS: u32 = 300;
pub const BPS_DENOMINATOR: i128 = 10_000;

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
    FeeTooHigh = 4,
    InvalidAmount = 5,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeConfig {
    pub treasury: Address,
    pub fee_bps: u32,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Config,
    Paused,
}

/// Comisión que corresponde a `amount` con `fee_bps`, truncada (a favor del comercio).
pub fn compute_fee(amount: i128, fee_bps: u32) -> i128 {
    amount * (fee_bps as i128) / BPS_DENOMINATOR
}

#[contract]
pub struct FeeSplitter;

fn admin(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(Error::NotInitialized)
}

fn config(env: &Env) -> Result<FeeConfig, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Config)
        .ok_or(Error::NotInitialized)
}

#[contractimpl]
impl FeeSplitter {
    pub fn init(env: Env, admin: Address, treasury: Address, fee_bps: u32) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        if fee_bps > MAX_FEE_BPS {
            return Err(Error::FeeTooHigh);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Config, &FeeConfig { treasury, fee_bps });
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        Ok(())
    }

    pub fn set_fee(env: Env, fee_bps: u32) -> Result<(), Error> {
        admin(&env)?.require_auth();
        if fee_bps > MAX_FEE_BPS {
            return Err(Error::FeeTooHigh);
        }
        let mut cfg = config(&env)?;
        cfg.fee_bps = fee_bps;
        env.storage().instance().set(&DataKey::Config, &cfg);
        env.events().publish((symbol_short!("fee_set"),), fee_bps);
        Ok(())
    }

    pub fn set_treasury(env: Env, treasury: Address) -> Result<(), Error> {
        admin(&env)?.require_auth();
        let mut cfg = config(&env)?;
        cfg.treasury = treasury;
        env.storage().instance().set(&DataKey::Config, &cfg);
        Ok(())
    }

    pub fn get_config(env: Env) -> Result<FeeConfig, Error> {
        config(&env)
    }

    /// Transfiere `amount` de `from`: `amount - fee` a `to` y `fee` a tesorería.
    /// Regresa `(neto_comercio, comision)`.
    pub fn split(
        env: Env,
        token: Address,
        from: Address,
        to: Address,
        amount: i128,
    ) -> Result<(i128, i128), Error> {
        if env.storage().instance().get(&DataKey::Paused).unwrap_or(false) {
            return Err(Error::Paused);
        }
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        from.require_auth();
        let cfg = config(&env)?;
        let fee = compute_fee(amount, cfg.fee_bps);
        let net = amount - fee;
        let tk = token::Client::new(&env, &token);
        tk.transfer(&from, &to, &net);
        if fee > 0 {
            tk.transfer(&from, &cfg.treasury, &fee);
        }
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
        env.events()
            .publish((Symbol::new(&env, "fee_charged"), to, token), (net, fee));
        Ok((net, fee))
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

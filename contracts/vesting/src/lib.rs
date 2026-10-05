#![no_std]

//! Vesting: token grants that unlock over time, enforced on-chain.
//!
//! A grantor (a startup, DAO or foundation) locks tokens for a beneficiary
//! (an employee, contributor or investor) under a schedule:
//!
//! ```text
//!   amount
//!   total ┤                         ┌──────────
//!         │                     ╱
//!         │                 ╱
//!         │             ╱
//!       0 ┼──────────┘
//!         start    cliff               start + duration
//! ```
//!
//! Nothing is claimable before the cliff. After it, tokens vest linearly
//! until `start + duration`, when everything is vested. The beneficiary
//! claims whatever has vested whenever they like.
//!
//! A grant can be marked revocable (e.g. an employee leaving). Revoking
//! pays the beneficiary everything vested so far, returns only the
//! *unvested* remainder to the grantor, and ends the schedule. Vested
//! tokens can never be clawed back.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env, Vec,
};

/// Most grants `create_schedules` accepts in one call.
pub const MAX_BATCH: u32 = 20;

/// Longest schedule accepted (200 years). Keeps every intermediate value in
/// the vesting maths far inside i128.
pub const MAX_DURATION: u64 = 200 * 365 * 86_400;

/// One grant in a `create_schedules` batch.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Grant {
    pub beneficiary: Address,
    pub total: i128,
    pub start: u64,
    pub cliff: u64,
    pub duration: u64,
    pub revocable: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Schedule {
    pub id: u64,
    pub grantor: Address,
    pub beneficiary: Address,
    pub token: Address,
    pub total: i128,
    /// Ledger timestamp vesting is measured from.
    pub start: u64,
    /// Seconds after `start` before anything vests.
    pub cliff: u64,
    /// Seconds after `start` at which everything has vested.
    pub duration: u64,
    pub claimed: i128,
    pub revocable: bool,
    pub revoked: bool,
}

#[contracttype]
pub enum DataKey {
    NextId,
    Schedule(u64),
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    ScheduleNotFound = 1,
    InvalidSchedule = 2,
    NothingToClaim = 3,
    NotRevocable = 4,
    AlreadyRevoked = 5,
    NotBeneficiary = 6,
}

#[contractevent(topics = ["vest", "created"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Created {
    #[topic]
    pub schedule_id: u64,
    pub beneficiary: Address,
    pub total: i128,
}

#[contractevent(topics = ["vest", "claimed"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Claimed {
    #[topic]
    pub schedule_id: u64,
    pub amount: i128,
}

#[contractevent(topics = ["vest", "moved"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BeneficiaryChanged {
    #[topic]
    pub schedule_id: u64,
    pub from: Address,
    pub to: Address,
}

#[contractevent(topics = ["vest", "revoked"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Revoked {
    #[topic]
    pub schedule_id: u64,
    pub paid_to_beneficiary: i128,
    pub returned_to_grantor: i128,
}

const DAY_IN_LEDGERS: u32 = 17_280;
const BUMP_THRESHOLD: u32 = 30 * DAY_IN_LEDGERS;
const BUMP_TO: u32 = 365 * DAY_IN_LEDGERS;

#[contract]
pub struct Vesting;

#[contractimpl]
impl Vesting {
    /// Lock `total` of `token` from the grantor under a new schedule.
    #[allow(clippy::too_many_arguments)]
    pub fn create_schedule(
        env: Env,
        grantor: Address,
        beneficiary: Address,
        token: Address,
        total: i128,
        start: u64,
        cliff: u64,
        duration: u64,
        revocable: bool,
    ) -> Result<u64, Error> {
        grantor.require_auth();
        let grant = Grant {
            beneficiary,
            total,
            start,
            cliff,
            duration,
            revocable,
        };
        check(&grantor, &grant)?;
        token::Client::new(&env, &token).transfer(&grantor, env.current_contract_address(), &total);
        Ok(insert(&env, &grantor, &token, grant))
    }

    /// Create up to `MAX_BATCH` grants in one call, pulling the combined total
    /// from the grantor once. Returns the new schedule ids in order.
    pub fn create_schedules(
        env: Env,
        grantor: Address,
        token: Address,
        grants: Vec<Grant>,
    ) -> Result<Vec<u64>, Error> {
        grantor.require_auth();
        if grants.is_empty() || grants.len() > MAX_BATCH {
            return Err(Error::InvalidSchedule);
        }
        let mut sum: i128 = 0;
        for g in grants.iter() {
            check(&grantor, &g)?;
            sum = sum.checked_add(g.total).ok_or(Error::InvalidSchedule)?;
        }
        token::Client::new(&env, &token).transfer(&grantor, env.current_contract_address(), &sum);
        let mut ids = Vec::new(&env);
        for g in grants.iter() {
            ids.push_back(insert(&env, &grantor, &token, g));
        }
        Ok(ids)
    }

    pub fn claim(env: Env, schedule_id: u64) -> Result<i128, Error> {
        let mut schedule = Self::get_schedule(env.clone(), schedule_id)?;
        schedule.beneficiary.require_auth();
        let amount = claimable(&env, &schedule);
        if amount <= 0 {
            return Err(Error::NothingToClaim);
        }
        schedule.claimed += amount;
        save(&env, &schedule);
        token::Client::new(&env, &schedule.token).transfer(
            &env.current_contract_address(),
            &schedule.beneficiary,
            &amount,
        );
        Claimed {
            schedule_id,
            amount,
        }
        .publish(&env);
        Ok(amount)
    }

    /// End a revocable schedule: vested tokens go to the beneficiary, the
    /// unvested remainder goes back to the grantor.
    pub fn revoke(env: Env, schedule_id: u64) -> Result<(), Error> {
        let mut schedule = Self::get_schedule(env.clone(), schedule_id)?;
        schedule.grantor.require_auth();
        if !schedule.revocable {
            return Err(Error::NotRevocable);
        }
        if schedule.revoked {
            return Err(Error::AlreadyRevoked);
        }

        let to_beneficiary = claimable(&env, &schedule);
        let vested = vested_amount(&schedule, env.ledger().timestamp());
        let to_grantor = schedule.total - vested;

        schedule.claimed += to_beneficiary;
        schedule.total = vested; // the schedule is now fully settled
        schedule.revoked = true;
        save(&env, &schedule);

        let client = token::Client::new(&env, &schedule.token);
        let vault = env.current_contract_address();
        if to_beneficiary > 0 {
            client.transfer(&vault, &schedule.beneficiary, &to_beneficiary);
        }
        if to_grantor > 0 {
            client.transfer(&vault, &schedule.grantor, &to_grantor);
        }
        Revoked {
            schedule_id,
            paid_to_beneficiary: to_beneficiary,
            returned_to_grantor: to_grantor,
        }
        .publish(&env);
        Ok(())
    }

    /// Let the beneficiary move the grant to a new address (e.g. a new
    /// wallet). Only the current beneficiary can do this.
    pub fn transfer_beneficiary(
        env: Env,
        schedule_id: u64,
        new_beneficiary: Address,
    ) -> Result<(), Error> {
        let mut schedule = Self::get_schedule(env.clone(), schedule_id)?;
        schedule.beneficiary.require_auth();
        if new_beneficiary == schedule.grantor {
            return Err(Error::InvalidSchedule);
        }
        let from = schedule.beneficiary.clone();
        schedule.beneficiary = new_beneficiary.clone();
        save(&env, &schedule);
        BeneficiaryChanged {
            schedule_id,
            from,
            to: new_beneficiary,
        }
        .publish(&env);
        Ok(())
    }

    /// Total vested so far (claimed + claimable).
    pub fn vested(env: Env, schedule_id: u64) -> Result<i128, Error> {
        let schedule = Self::get_schedule(env.clone(), schedule_id)?;
        Ok(if schedule.revoked {
            schedule.total
        } else {
            vested_amount(&schedule, env.ledger().timestamp())
        })
    }

    pub fn claimable(env: Env, schedule_id: u64) -> Result<i128, Error> {
        let schedule = Self::get_schedule(env.clone(), schedule_id)?;
        Ok(claimable(&env, &schedule))
    }

    /// Number of schedules ever created; ids run from 1 to this value.
    pub fn schedule_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::NextId).unwrap_or(0)
    }

    pub fn get_schedule(env: Env, schedule_id: u64) -> Result<Schedule, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Schedule(schedule_id))
            .ok_or(Error::ScheduleNotFound)
    }
}

/// Amount vested at time `now` under the cliff + linear schedule.
pub fn vested_amount(s: &Schedule, now: u64) -> i128 {
    if now < s.start + s.cliff {
        return 0;
    }
    let elapsed = now - s.start;
    if elapsed >= s.duration {
        return s.total;
    }
    // total * elapsed / duration without overflowing: split total into
    // q * duration + r, so the product only ever involves r < duration.
    let duration = s.duration as i128;
    let elapsed = elapsed as i128;
    let (q, r) = (s.total / duration, s.total % duration);
    q * elapsed + r * elapsed / duration
}

fn claimable(env: &Env, s: &Schedule) -> i128 {
    if s.revoked {
        return 0;
    }
    vested_amount(s, env.ledger().timestamp()) - s.claimed
}

fn check(grantor: &Address, g: &Grant) -> Result<(), Error> {
    if g.total <= 0
        || g.duration == 0
        || g.duration > MAX_DURATION
        || g.cliff > g.duration
        || *grantor == g.beneficiary
    {
        return Err(Error::InvalidSchedule);
    }
    g.start
        .checked_add(g.duration)
        .ok_or(Error::InvalidSchedule)?;
    Ok(())
}

fn insert(env: &Env, grantor: &Address, token: &Address, g: Grant) -> u64 {
    let id = next_id(env);
    let schedule = Schedule {
        id,
        grantor: grantor.clone(),
        beneficiary: g.beneficiary.clone(),
        token: token.clone(),
        total: g.total,
        start: g.start,
        cliff: g.cliff,
        duration: g.duration,
        claimed: 0,
        revocable: g.revocable,
        revoked: false,
    };
    save(env, &schedule);
    Created {
        schedule_id: id,
        beneficiary: g.beneficiary,
        total: g.total,
    }
    .publish(env);
    id
}

fn save(env: &Env, schedule: &Schedule) {
    let key = DataKey::Schedule(schedule.id);
    env.storage().persistent().set(&key, schedule);
    env.storage()
        .persistent()
        .extend_ttl(&key, BUMP_THRESHOLD, BUMP_TO);
    // The instance holds the id counter; keep it alive on every write.
    env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_TO);
}

fn next_id(env: &Env) -> u64 {
    let next: u64 = env
        .storage()
        .instance()
        .get(&DataKey::NextId)
        .unwrap_or(0u64)
        + 1;
    env.storage().instance().set(&DataKey::NextId, &next);
    env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_TO);
    next
}

mod test;

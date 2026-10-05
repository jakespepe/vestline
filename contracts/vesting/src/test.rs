#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token::StellarAssetClient,
    Env,
};

const DAY: u64 = 86_400;
const YEAR: u64 = 365 * DAY;
const START: u64 = 1_700_000_000;
const GRANT: i128 = 48_000_000;

struct Setup<'a> {
    env: Env,
    vesting: VestingClient<'a>,
    token: Address,
    token_client: token::Client<'a>,
    grantor: Address,
    employee: Address,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = START);
    let vesting = VestingClient::new(&env, &env.register(Vesting, ()));
    let token = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();
    let token_client = token::Client::new(&env, &token);
    let grantor = Address::generate(&env);
    let employee = Address::generate(&env);
    StellarAssetClient::new(&env, &token).mint(&grantor, &(GRANT * 10));
    Setup {
        env,
        vesting,
        token,
        token_client,
        grantor,
        employee,
    }
}

/// Standard 4-year grant with a 1-year cliff.
fn four_year_grant(s: &Setup, revocable: bool) -> u64 {
    s.vesting.create_schedule(
        &s.grantor,
        &s.employee,
        &s.token,
        &GRANT,
        &START,
        &YEAR,
        &(4 * YEAR),
        &revocable,
    )
}

fn at(s: &Setup, timestamp: u64) {
    s.env.ledger().with_mut(|l| l.timestamp = timestamp);
}

#[test]
fn creating_a_schedule_escrows_the_grant() {
    let s = setup();
    let id = four_year_grant(&s, false);

    assert_eq!(s.token_client.balance(&s.vesting.address), GRANT);
    assert_eq!(s.token_client.balance(&s.grantor), GRANT * 9);
    let schedule = s.vesting.get_schedule(&id);
    assert_eq!(schedule.total, GRANT);
    assert_eq!(schedule.claimed, 0);
}

#[test]
fn rejects_invalid_schedules() {
    let s = setup();
    let bad = |total: i128, cliff: u64, duration: u64, beneficiary: &Address| {
        s.vesting.try_create_schedule(
            &s.grantor,
            beneficiary,
            &s.token,
            &total,
            &START,
            &cliff,
            &duration,
            &false,
        )
    };
    assert_eq!(
        bad(0, 0, YEAR, &s.employee),
        Err(Ok(Error::InvalidSchedule))
    );
    assert_eq!(
        bad(GRANT, 0, 0, &s.employee),
        Err(Ok(Error::InvalidSchedule))
    );
    assert_eq!(
        bad(GRANT, 2 * YEAR, YEAR, &s.employee),
        Err(Ok(Error::InvalidSchedule))
    );
    assert_eq!(
        bad(GRANT, 0, YEAR, &s.grantor),
        Err(Ok(Error::InvalidSchedule))
    );
}

#[test]
fn nothing_vests_before_the_cliff() {
    let s = setup();
    let id = four_year_grant(&s, false);

    at(&s, START + YEAR - 1);
    assert_eq!(s.vesting.vested(&id), 0);
    assert_eq!(s.vesting.try_claim(&id), Err(Ok(Error::NothingToClaim)));
}

#[test]
fn the_cliff_releases_the_accrued_portion_at_once() {
    let s = setup();
    let id = four_year_grant(&s, false);

    at(&s, START + YEAR);
    // A quarter of the 4-year grant accrued during the cliff year.
    assert_eq!(s.vesting.claimable(&id), GRANT / 4);
}

#[test]
fn vests_linearly_and_claims_accumulate() {
    let s = setup();
    let id = four_year_grant(&s, false);

    at(&s, START + 2 * YEAR);
    assert_eq!(s.vesting.claim(&id), GRANT / 2);

    at(&s, START + 3 * YEAR);
    assert_eq!(s.vesting.claim(&id), GRANT / 4);
    assert_eq!(s.token_client.balance(&s.employee), 3 * GRANT / 4);
    assert_eq!(s.vesting.try_claim(&id), Err(Ok(Error::NothingToClaim)));
}

#[test]
fn everything_vests_at_the_end_and_never_more() {
    let s = setup();
    let id = four_year_grant(&s, false);

    at(&s, START + 10 * YEAR);
    assert_eq!(s.vesting.vested(&id), GRANT);
    s.vesting.claim(&id);
    assert_eq!(s.token_client.balance(&s.employee), GRANT);
    assert_eq!(s.token_client.balance(&s.vesting.address), 0);
}

#[test]
fn revoking_pays_vested_and_returns_only_unvested() {
    let s = setup();
    let id = four_year_grant(&s, true);

    at(&s, START + YEAR + YEAR / 2); // 1.5 years in: 37.5% vested
    s.vesting.revoke(&id);

    let vested = GRANT * 3 / 8;
    assert_eq!(s.token_client.balance(&s.employee), vested);
    assert_eq!(
        s.token_client.balance(&s.grantor),
        GRANT * 9 + (GRANT - vested)
    );
    assert_eq!(s.token_client.balance(&s.vesting.address), 0);

    // Time passing after revocation doesn't vest anything else.
    at(&s, START + 4 * YEAR);
    assert_eq!(s.vesting.vested(&id), vested);
    assert_eq!(s.vesting.try_claim(&id), Err(Ok(Error::NothingToClaim)));
}

#[test]
fn revoking_respects_amounts_already_claimed() {
    let s = setup();
    let id = four_year_grant(&s, true);

    at(&s, START + 2 * YEAR);
    s.vesting.claim(&id); // takes 50%
    at(&s, START + 3 * YEAR);
    s.vesting.revoke(&id); // 75% vested: 25% more to employee, 25% back

    assert_eq!(s.token_client.balance(&s.employee), 3 * GRANT / 4);
    assert_eq!(s.token_client.balance(&s.grantor), GRANT * 9 + GRANT / 4);
}

#[test]
fn revoking_before_the_cliff_returns_everything() {
    let s = setup();
    let id = four_year_grant(&s, true);
    at(&s, START + DAY);
    s.vesting.revoke(&id);
    assert_eq!(s.token_client.balance(&s.employee), 0);
    assert_eq!(s.token_client.balance(&s.grantor), GRANT * 10);
}

#[test]
fn irrevocable_grants_cannot_be_revoked_and_revoke_is_one_shot() {
    let s = setup();
    let fixed = four_year_grant(&s, false);
    assert_eq!(s.vesting.try_revoke(&fixed), Err(Ok(Error::NotRevocable)));

    let flexible = four_year_grant(&s, true);
    s.vesting.revoke(&flexible);
    assert_eq!(
        s.vesting.try_revoke(&flexible),
        Err(Ok(Error::AlreadyRevoked))
    );
}

#[test]
fn beneficiary_can_move_the_grant_to_a_new_wallet() {
    let s = setup();
    let id = four_year_grant(&s, false);
    let new_wallet = Address::generate(&s.env);

    s.vesting.transfer_beneficiary(&id, &new_wallet);
    at(&s, START + 4 * YEAR);
    s.vesting.claim(&id);

    assert_eq!(s.token_client.balance(&new_wallet), GRANT);
    assert_eq!(s.token_client.balance(&s.employee), 0);
}

#[test]
#[should_panic]
fn only_the_beneficiary_can_claim() {
    let s = setup();
    let id = four_year_grant(&s, false);
    at(&s, START + 4 * YEAR);
    s.env.set_auths(&[]);
    s.vesting.claim(&id);
}

#[test]
fn vesting_can_start_in_the_future() {
    let s = setup();
    let id = s.vesting.create_schedule(
        &s.grantor,
        &s.employee,
        &s.token,
        &GRANT,
        &(START + YEAR),
        &0,
        &YEAR,
        &false,
    );
    at(&s, START + YEAR / 2);
    assert_eq!(s.vesting.vested(&id), 0);
    at(&s, START + YEAR + YEAR / 2);
    assert_eq!(s.vesting.vested(&id), GRANT / 2);
}

#[test]
fn huge_grants_vest_without_overflow() {
    let s = setup();
    let huge: i128 = i128::MAX / 4;
    StellarAssetClient::new(&s.env, &s.token).mint(&s.grantor, &huge);
    let id = s.vesting.create_schedule(
        &s.grantor,
        &s.employee,
        &s.token,
        &huge,
        &START,
        &0,
        &(4 * YEAR),
        &false,
    );
    at(&s, START + 2 * YEAR);
    assert_eq!(s.vesting.vested(&id), huge / 2);
    at(&s, START + 4 * YEAR);
    assert_eq!(s.vesting.claim(&id), huge);
}

#[test]
fn batch_creates_grants_and_pulls_the_total_once() {
    use soroban_sdk::vec;
    let s = setup();
    let other = Address::generate(&s.env);
    let grant = |who: &Address, total: i128| Grant {
        beneficiary: who.clone(),
        total,
        start: START,
        cliff: YEAR,
        duration: 4 * YEAR,
        revocable: true,
    };
    let ids = s.vesting.create_schedules(
        &s.grantor,
        &s.token,
        &vec![&s.env, grant(&s.employee, GRANT), grant(&other, GRANT / 2)],
    );
    assert_eq!(ids, vec![&s.env, 1, 2]);
    assert_eq!(s.vesting.schedule_count(), 2);
    assert_eq!(
        s.token_client.balance(&s.vesting.address),
        GRANT + GRANT / 2
    );
    assert_eq!(s.vesting.get_schedule(&2).beneficiary, other);

    // One bad grant rejects the whole batch.
    assert_eq!(
        s.vesting.try_create_schedules(
            &s.grantor,
            &s.token,
            &vec![&s.env, grant(&s.employee, GRANT), grant(&other, 0)],
        ),
        Err(Ok(Error::InvalidSchedule))
    );
    assert_eq!(
        s.vesting
            .try_create_schedules(&s.grantor, &s.token, &Vec::new(&s.env)),
        Err(Ok(Error::InvalidSchedule))
    );
}

#[test]
fn moving_a_grant_emits_an_event() {
    use soroban_sdk::testutils::Events as _;
    let s = setup();
    let id = four_year_grant(&s, false);
    let fresh = Address::generate(&s.env);
    s.vesting.transfer_beneficiary(&id, &fresh);
    assert_eq!(s.env.events().all().events().len(), 1);
}

# Vestline

**Token vesting on Stellar: cliffs, linear unlocks and fair revocation.**

Vestline is a Soroban contract for team, contributor and investor token
grants. The grantor locks tokens up front; they unlock on a schedule the
beneficiary can verify on-chain, and nobody (not even the grantor) can
take back what has already vested.

```text
  amount
  total ┤                         ┌──────────
        │                     ╱
        │                 ╱
        │             ╱
      0 ┼──────────┘
        start    cliff               start + duration
```

A typical startup grant is **4 years with a 1-year cliff**: nothing for 12
months, then 25% at once, then the rest unlocking second by second until
year 4.

## Features

- **Escrowed up front.** `create_schedule` moves the full grant into the
  contract, so the beneficiary never depends on the grantor paying later.
- **Cliff + linear vesting**, measured from any `start` (past, now or
  future).
- **Claim any time.** The beneficiary pulls whatever has vested, as often
  as they like.
- **Fair revocation** (optional, per grant). If a revocable grant is
  revoked, the beneficiary is paid **everything vested so far**, only the
  unvested remainder returns to the grantor, and the schedule ends.
  Irrevocable grants can never be revoked.
- **Portable.** The beneficiary can move a grant to a new wallet.
- Storage lifetimes are extended for up to a year on every write, to suit
  multi-year schedules.

## Contract interface

| Function | Who signs | Notes |
| --- | --- | --- |
| `create_schedule(grantor, beneficiary, token, total, start, cliff, duration, revocable)` | grantor | Escrows `total`; `cliff ≤ duration` |
| `claim(schedule_id)` | beneficiary | Returns the amount paid |
| `revoke(schedule_id)` | grantor | Revocable grants only, once |
| `transfer_beneficiary(schedule_id, new_beneficiary)` | beneficiary | |
| `vested`, `claimable`, `get_schedule` | anyone | Read state |

`start` is a Unix timestamp; `cliff` and `duration` are in seconds after
`start`.

Errors: `ScheduleNotFound (1)`, `InvalidSchedule (2)`, `NothingToClaim (3)`,
`NotRevocable (4)`, `AlreadyRevoked (5)`, `NotBeneficiary (6)`.

Events: `("vest","created", id)`, `("vest","claimed", id)`,
`("vest","revoked", id)`, with amounts in the data.

## Build, test and deploy

```bash
cd contracts
cargo test           # 13 unit tests
stellar contract build
stellar contract deploy --wasm target/wasm32v1-none/release/vesting.wasm \
  --source me --network testnet
```

Create a 4-year, 1-year-cliff, revocable grant of 48,000 tokens:

```bash
stellar contract invoke --id <VESTLINE> --source founder --network testnet -- \
  create_schedule --grantor founder --beneficiary G...EMPLOYEE \
  --token <TOKEN_SAC_ID> --total 480000000000 \
  --start 1767225600 --cliff 31536000 --duration 126144000 --revocable true
```

## Glossary (new to Stellar?)

- **Vesting**: gradually giving someone full ownership of tokens over
  time, to align incentives.
- **Cliff**: an initial period during which nothing vests. When it ends,
  everything accrued during it unlocks at once.
- **Linear vesting**: after the cliff, tokens unlock evenly over time.
- **Revocable grant**: one the grantor may end early, typically when
  someone leaves. Vested tokens still belong to the beneficiary.
- **Escrow**: tokens held by the contract, not by either party.
- **Soroban / SAC**: Stellar's smart-contract platform / the contract
  address representing a Stellar asset.

## License

MIT

# Architecture

## Vesting formula

```text
vested(t) = 0                                   if t < start + cliff
          = total                               if t ≥ start + duration
          = total × (t − start) / duration      otherwise
claimable  = vested(now) − claimed              (0 once revoked)
```

The cliff hides accrual rather than delaying it: at `start + cliff` the
beneficiary can claim everything accrued since `start`, matching how
employee grants work in practice.

## Custody

`create_schedule` transfers `total` from the grantor into the contract up
front. The beneficiary never depends on the grantor's future solvency or
goodwill.

## Revocation

```text
revoke():
  to_beneficiary = claimable(now)
  vested         = vested(now)
  to_grantor     = total − vested
  total := vested;  claimed += to_beneficiary;  revoked = true
```

Both transfers happen in the same call. After revocation, `vested()`
returns the frozen amount and `claimable()` returns 0.

## Lifetimes

Schedules can span years, so entries are extended up to 365 days on each
write. Long idle periods still need someone (anyone) to touch the entry,
and a `claim` does that.

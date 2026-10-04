# Grant recipes

All times are seconds. 1 year = 31,536,000.

| Grant | start | cliff | duration | revocable |
| --- | --- | --- | --- | --- |
| Employee, 4y with 1y cliff | hire date | 31536000 | 126144000 | true |
| Advisor, 2y no cliff | agreement date | 0 | 63072000 | true |
| Investor lock-up, 1y then linear 2y | TGE | 31536000 | 94608000 | false |
| Delayed bonus, all at once in 6 months | today | 15768000 | 15768000 | false |

The last row uses `cliff == duration` to create a single unlock.

## Tips

- Use **irrevocable** grants for investors and token sales. They can verify
  on-chain that nobody can claw them back.
- Put the grantor role behind a multisig such as Quorum Vault so revocation
  needs more than one person.
- Beneficiaries can move grants to a new wallet with `transfer_beneficiary`.

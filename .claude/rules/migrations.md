---
paths:
  - "**/migrations/**"
  - "**/schema/**"
---

- Every migration needs forward validation, rollback/roll-forward notes, and an estimate of lock/rewrite risk.
- Add fields as nullable or with safe server defaults before making them required.
- Never rewrite or delete the append-only historical event ledger in an ordinary migration.
- Preserve compatibility between the currently deployed and next application version.

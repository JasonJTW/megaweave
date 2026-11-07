# Security review

Trace each finding from untrusted input to its impact and cite `file:line`. Report only confirmed exploitable issues; every one is **blocking** and fails the PR check. Zero findings is a valid result.

## Checklist

Check every item against the changed lines:

1. **SQL**: every value reaching a query is a bound parameter.
2. **Authorization**: every changed route verifies the caller owns or may access the resource; invisible posts return 404 (ADR 0003).
3. **Input**: request bodies, params and queries are parsed with Zod before use.
4. **Webhooks and callbacks** (ECPay, Lalamove): the signature or auth is verified before any state change; a replayed request leaves state unchanged.
5. **Secrets and errors**: keys stay server-side in env and never use a `NEXT_PUBLIC_` prefix; 5xx responses carry no internals.
6. **Workflows**: secrets and PR-controlled text stay out of shells and `run:` steps.

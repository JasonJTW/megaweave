# Code review

Signal over volume: each finding names a concrete defect and its fix.

## Standards

Apply every standard to every changed line:

- **Correctness**: logic errors, unhandled `await`, races, missing transaction on multi-step writes, unvalidated input at a boundary.
- **Conventions**: the Error Handling, API Error Codes, and Database rules in `CLAUDE.md`.
- **ADRs**: a change that contradicts an ADR in `docs/adr/` (cite its number and the contradicted sentence), or makes a new architectural decision with no ADR.
- **Tests**: a behaviour change ships with a test.

## Blocking

A finding is **blocking** when it is a correctness defect, a behaviour change without a test, or a contradiction of an ADR. Blocking findings fail the PR check. Every other finding is advisory: post it, and the PR can still merge.

## Scope

- Changed lines only. At most 5 findings, blocking first.
- Leave formatting and lint to Prettier and ESLint.
- Zero findings is a valid result.

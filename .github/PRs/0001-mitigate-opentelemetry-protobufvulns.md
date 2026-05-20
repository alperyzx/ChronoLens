Title: Mitigate npm-audit findings by pinning safe transitive versions (overrides)

Summary

This PR adds `overrides` entries to `package.json` to force non-vulnerable versions of transitive dependencies flagged by `npm audit`:

- `@opentelemetry/sdk-node` => `^0.217.0`
- `@opentelemetry/auto-instrumentations-node` => `^0.75.0`
- `protobufjs` => `^7.5.8`

Rationale

`genkit` and several `@genkit-ai/*` packages transitively pull older `@opentelemetry` packages and `protobufjs` versions that are flagged by `npm audit`. Upstream fixes may be required, so this PR uses an npm short-term mitigation via `overrides` to resolve the audit report to 0 vulnerabilities while we coordinate with upstream.

What changed

- Edited `package.json` to add `overrides` for the listed packages.

Notes about install warnings

You may see peer dependency warnings during `npm install` (this is expected). We verified that after the overrides `npm audit` returns 0 vulnerabilities. There are potential peer conflicts between `@opentelemetry` major versions required by some `@google-cloud/*` packages; these are not resolved by the overrides and should be tracked with upstream `genkit` and the Google Cloud library maintainers.

Testing performed

- `npm install` completed successfully (with peer dep warnings).
- `npm audit` reported 0 vulnerabilities.
- `npm run typecheck` produced no errors.
- `npm run test:gemini-cache` passed.

Follow-ups (recommended)

1. Open an upstream issue/PR against `genkit` asking them to bump transitive `@opentelemetry` ranges to non-vulnerable versions.
2. Consider removing unused `@genkit-ai/google-cloud` or `@genkit-ai/firebase` if not needed to reduce surface area.
3. Add Dependabot or a GitHub Action to monitor and auto-propose updates for `genkit` and `@opentelemetry`.
4. Add a CI gating step that fails on high/critical `npm audit` issues.

How to create the branch, commit, and open the PR locally

Run these commands locally from the repository root:

```bash
git checkout -b fix/npm-audit-overrides
git add package.json
git commit -m "chore: add npm overrides to mitigate opentelemetry/protobuf vulnerabilities"
git push --set-upstream origin fix/npm-audit-overrides
# then open a PR on GitHub using your preferred method (gh cli or the web)
# with title and description from this file
```

If you want, I can also prepare a Dependabot config and a short upstream issue template — tell me and I'll add them in a follow-up commit.

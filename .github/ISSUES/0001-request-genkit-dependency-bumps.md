Title: Request: Bump transitive @opentelemetry and protobufjs ranges to mitigate npm-audit alerts

Description

Hello `genkit` maintainers —

We're using `genkit` and the `@genkit-ai/*` packages in a project and noticed `npm audit` flags transitive vulnerabilities in `@opentelemetry` and `protobufjs`. As an immediate mitigation we've temporarily used npm `overrides` in our project, but we'd prefer an upstream fix so projects using `genkit` don't need local overrides.

Affected transitive packages (examples):
- `@opentelemetry/sdk-node` (older <0.217 versions)
- `@opentelemetry/auto-instrumentations-node` (older <=0.74.0)
- `protobufjs` (<=7.5.7)

Requested change

Could you please update `genkit` (and the `@genkit-ai/*` packages) to depend on non-vulnerable ranges of these packages (or bump to versions that no longer trigger `npm audit`)? Specifically:
- Ensure `@opentelemetry/sdk-node` and related `@opentelemetry/*` packages are at least `0.217.0` or a secure 1.x stable that addresses GHSA-q7rr-3cgh-j5r3.
- Ensure `protobufjs` is bumped to >=7.5.8.

Notes

- We observed peer dependency warnings when forcing overrides; an upstream bump would avoid these conflicts.
- We're happy to help validate a release or provide repro info.

Thanks for the project — let us know if you'd like a PR we can prepare.

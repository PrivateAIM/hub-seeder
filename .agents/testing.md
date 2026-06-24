# Testing

## Setup

- **Runner**: [Vitest](https://vitest.dev) v4
- **Test location**: `test/unit/**/*.{test,spec}.{js,ts}`
- **Config**: `test/vitest.config.ts` (passed explicitly via `--config`)
- **Prerequisite**: the current suite asserts on build artifacts, so run `npm run build` before `npm test`.

## Running Tests

```bash
npm test                 # vitest --config test/vitest.config.ts --run  (single run, no watch)
npm run test:coverage    # same, with v8 coverage + thresholds enforced
npx vitest --config test/vitest.config.ts test/unit/index.spec.ts   # a single file
```

The CI pipeline runs `npm run build` before `npm run test`, mirroring the local prerequisite.

## Test Layers

### Unit / smoke

The only existing test (`test/unit/index.spec.ts`) is a build-output smoke test: it verifies that `dist/cli/index.mjs` and `dist/index.mjs` were emitted by the build. It does not exercise provisioning logic — it guards that both the library and CLI entry points are produced.

## Testing Philosophy

Tests should assert *expected* behavior based on the command contract and the architecture docs — not merely confirm what the implementation currently does. If a test fails, treat it as a possible real bug in the implementation, not automatically a test error.

### Testing core commands

The core command functions (`src/commands/seed-*/`) are deliberately decoupled from citty and take typed `*Options`, so they can be imported and driven directly in tests. They depend on the outside world in two ways, both of which are the seams to control in a test:

- **HTTP clients** — built inside `createAuthenticatedClients()` (Hub + Authup). To test a command without a live Hub/Authup, the cleanest approach is to inject fakes for the `Client` / `AuthupHttpClient` resource methods (`node.getMany`, `node.create`, `client.update`, etc.) rather than spying on individual calls.
- **Environment variables** — commands read `process.env` directly (`HUB_URL`, `NODE_TYPE`, `OUTPUT_DIR`, …). Set/restore env around each test.

**Prefer fakes over spy stubs (`vi.fn()` / `vi.mock()`).** A fake resource object that returns realistic in-memory data (and records calls) makes assertions about the idempotent "create if missing" behavior far clearer than asserting on mock call counts. Filesystem output (`values.yaml`, `private_key.pem`) can be checked by pointing `OUTPUT_DIR` at a temp directory and reading the files back.

Note that the commands call `process.exit(1)` on failure and write files via the synchronous `node:fs` API — account for both when designing a test (e.g. stub `process.exit`, use a throwaway `OUTPUT_DIR`).

## Code Coverage

```bash
npm run test:coverage
```

Coverage uses the v8 provider over `src/**/*.{ts,tsx,js,jsx}` with these thresholds (a run below any of them fails):

| Metric     | Threshold |
|------------|-----------|
| Branches   | 80%       |
| Functions  | 80%       |
| Lines      | 80%       |
| Statements | 80%       |

> The thresholds are configured in `test/vitest.config.ts`. The current smoke-test-only suite does not meet them; expanding command-level coverage is the path to a green `test:coverage`.

## CI Pipeline

GitHub Actions (`.github/workflows/main.yml`) runs on push/PR to `develop`, `master`, `next`, `beta`, `alpha`:

```
Install ──▶ Build ──▶ Lint
                 └──▶ Test   (npm run test, after build)
```

All jobs run on Node 24 (`PRIMARY_NODE_VERSION`).

## Writing New Tests

1. Place test files under `test/unit/` with a `.spec.ts` (or `.test.ts`) extension.
2. For core-command tests, import from `src/commands/...`, inject fake Hub/Authup resources, set the env the command reads, and point `OUTPUT_DIR` at a temp dir.
3. Run `npm test` (build first if your test touches `dist/`).

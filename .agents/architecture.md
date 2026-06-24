# Architecture

## System Overview

`hub-seeder` is a one-shot provisioning CLI used to bootstrap **preview and test environments** for the PrivateAIM HUB. It talks to two external services — the **Hub** (resource management) and **Authup** (auth/OAuth) — using a shared client-credentials token, runs a sequence of idempotent steps, and (for `seed-node`) writes credential and key files consumed by the `flame-node` Helm chart.

```
   env / CLI args
        │
        ▼
┌──────────────────────────────┐
│  CLI adapter (citty)         │  src/cli/
│  seed-node | seed-project    │  — parse args, resolve env, fail fast on missing input
└──────────────┬───────────────┘
               │ typed *Options
               ▼
┌──────────────────────────────┐
│  Core command (step runner)  │  src/commands/seed-*/
│  step() / skip() / failures  │
└───────┬──────────────┬───────┘
        │              │        createAuthenticatedClients() — shared auth hook
   ┌────▼─────┐   ┌────▼──────────┐
   │ Hub API  │   │ Authup API    │
   │ Client   │   │ Client (OAuth │
   │ (nodes,  │   │ client mgmt)  │
   │ projects)│   └───────────────┘
   └──────────┘
        │
        ▼
   Output files (seed-node):  values.yaml  +  private_key.pem
```

## Overview

The design is a thin **adapter → core** split with a lightweight **step runner** orchestrating the work:

- **CLI adapter** (`src/cli/`) — citty commands. Responsible only for resolving input (args + env) and surfacing usage errors. Delegates to a core command function.
- **Core command** (`src/commands/seed-*/`) — the actual provisioning logic, expressed as a series of named steps run through the step runner.
- **Helpers** (`src/commands/helpers.ts`) — constructs the authenticated Hub/Authup clients and provides the step runner.

## Core Design Decisions

### 1. Idempotent, re-runnable seeding

Every mutating step is "create if missing": it queries by name first and reuses the existing resource (node, registry assignment, project, project-node link) rather than failing on conflict. This makes the seeder safe to run repeatedly against the same environment — the intended usage for preview/test setups.

### 2. Step runner with deferred failure

Instead of aborting on the first error, each step is wrapped so a failure is logged (with full request/response detail) and recorded in a `failures[]` list while subsequent steps continue. Steps whose preconditions are unmet are explicitly `skip()`-ped (which also counts as a failure). After all steps run, the command exits with code `1` if `failures.length > 0`. This yields a complete diagnostic picture in one run rather than one-error-at-a-time.

### 3. Library/CLI dual entry

The same provisioning logic is published as a library (`src/index.ts`) and as a bin (`src/cli/index.ts`). Core functions take typed options and never depend on citty, so they can be imported and driven programmatically.

## Step Runner Pattern

`createStepRunner(log)` returns `{ step, skip, failures }`. This is the central abstraction for both commands.

```typescript
export interface StepRunner {
    step: <T>(name: string, action: () => Promise<T>) => Promise<T | undefined>;
    skip: (name: string, reason: string) => void;
    failures: string[];
}
```

- `step(name, action)` — runs `action`; on success returns its value, on throw it calls `logStepError` (which logs message, stack, cause, and any HTTP request/response payload) and pushes `name` onto `failures`, returning `undefined`.
- `skip(name, reason)` — records a skipped step as a failure with a reason (used when an earlier step left a precondition unsatisfied, e.g. node never got created).

Usage in a command:

```typescript
const { step, skip, failures } = createStepRunner(log);

let node = await step('Create node (if missing)', async () => { /* ... */ });

if (node) {
    await step('Assign registry to node', async () => { /* ... */ });
} else {
    skip('Assign registry to node', 'Node is unavailable.');
}

if (failures.length > 0) {
    log.error(`Seed failed with ${failures.length} error(s): ${failures.join(', ')}`);
    process.exit(1);
}
```

When adding a new step, follow this shape: name it as a human-readable phrase, guard it on the availability of its inputs, and `skip()` with a reason when a precondition is missing.

## Authenticated Clients Pattern

`createAuthenticatedClients()` builds one Hub client and one Authup client and attaches a **single shared authentication hook** to both, so they authenticate with the same client-credentials token:

```typescript
const hub = new Client({ baseURL: hubUrl });               // @privateaim/core-http-kit
const authup = new AuthupHttpClient({ baseURL: authupUrl }); // @authup/core-http-kit

const tokenCreator = createAuthupClientTokenCreator({ baseURL: authupUrl, clientId, clientSecret, realm });
const authHook = createAuthupClientAuthenticationHook({ baseURL: authupUrl, tokenCreator, timer: false });
authHook.attach(hub);
authHook.attach(authup);
```

It throws immediately if `CLIENT_ID` / `CLIENT_SECRET` are absent.

## Data Flow

### `seed-node`

```
Input:
  └── node name (--node-name | NODE_NAME), NODE_TYPE, NODE_URL, PROJECT_NAME?, OUTPUT_DIR

Processing (steps):
  1. Create node (if missing)                       — by name; sets external_name, type
  2. Assign registry to node                        — default registry "default"
  3. Get node client id                              — polls up to 15× (500ms) for Authup client assignment
  4. Generate ECDH P-256 key pair, set public_key    — keeps private key in memory
  5. Set Authup OAuth client secret & redirect URI   — random 32-char secret; redirect = NODE_URL + "/**"
  6. Assign node to project (if PROJECT_NAME given)   — links node ↔ project, idempotent

Output (only if no failures):
  ├── <OUTPUT_DIR>/values.yaml      — hub.auth + ui.idp clientId/clientSecret (flame-node chart)
  └── <OUTPUT_DIR>/private_key.pem  — generated node private key (PEM)
```

### `seed-project`

```
Input:    PROJECT_NAME (required), PROJECT_DISPLAY_NAME?
Process:  1. Create project (if missing) — by name; display_name defaults to name
Output:   none (resource created on the Hub)
```

## Error Handling

- **Per-step**: caught by the step runner, logged in detail via `logStepError`, recorded in `failures`. Execution continues.
- **Command-level**: non-empty `failures` → `log.error(...)` + `process.exit(1)` **before** any output files are written.
- **Top-level (CLI)**: `src/cli/index.ts` wraps `runMain` in a `.catch` that `console.error`s and `process.exit(1)`.
- **Input validation**: missing required input (node name, `PROJECT_NAME`, credentials, invalid `NODE_TYPE`) throws synchronously with a clear message.

## Authentication

Client-credentials OAuth against Authup. The CLI authenticates as a confidential client (`CLIENT_ID`/`CLIENT_SECRET`) in a realm (`REALM`, default `master`); the resulting token is injected into both the Hub and Authup HTTP clients by the shared auth hook. `seed-node` additionally **provisions** the per-node OAuth client on Authup (rotating its secret and setting its redirect URI).

> **TLS note:** `src/cli/index.ts` sets `NODE_TLS_REJECT_UNAUTHORIZED = '0'`, disabling certificate verification. This is intentional for self-signed preview/test environments and is a deliberate constraint of this tool — do not rely on it in production contexts.

## Configuration

All runtime configuration is via environment variables (the CLI exposes only `--node-name` as a flag).

| Variable               | Used by         | Purpose                                                              |
|------------------------|-----------------|---------------------------------------------------------------------|
| `HUB_URL`              | both            | Hub API base URL                                                    |
| `AUTHUP_URL`           | both            | Authup API base URL                                                 |
| `REALM`                | both            | Authup realm for the client-credentials token (default `master`)   |
| `CLIENT_ID`            | both (required) | Confidential client id used to authenticate                         |
| `CLIENT_SECRET`        | both (required) | Confidential client secret                                          |
| `NODE_NAME`            | seed-node       | Node name to create/find (overridden by `--node-name`)             |
| `NODE_TYPE`            | seed-node       | `default` or `aggregator` (default `default`)                      |
| `NODE_URL`             | seed-node       | Node base URL; used to derive the OAuth redirect URI (`<url>/**`)  |
| `OUTPUT_DIR`           | seed-node       | Directory for `values.yaml` / `private_key.pem` (default `.`)      |
| `PROJECT_NAME`         | seed-project (required), seed-node (optional) | Project to create / to assign the node to        |
| `PROJECT_DISPLAY_NAME` | seed-project    | Project display name (defaults to `PROJECT_NAME`)                  |

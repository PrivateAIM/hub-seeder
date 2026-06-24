# Project Structure

`@privateaim/hub-seeder` is a single-package, ESM-only TypeScript CLI. It is published both as a library (`seedNodeCommand` / `seedProjectCommand`) and as an executable (`hub-seeder` bin). The codebase is split into two layers: a thin **CLI adapter** (`src/cli/`) and the transport-agnostic **core command logic** (`src/commands/`).

## Directory Layout

```
hub-seeder/
├── src/
│   ├── index.ts                    # Library entry — re-exports core command functions + option types
│   ├── cli/                        # CLI adapter layer (citty)
│   │   ├── index.ts                # Bin entry point (#!/usr/bin/env node) — runMain bootstrap
│   │   ├── module.ts               # Root `hub-seeder` command + subcommand wiring
│   │   └── commands/
│   │       ├── index.ts            # Barrel
│   │       ├── seed-node.ts        # `seed-node` subcommand — resolves args/env → seedNodeCommand
│   │       └── seed-project.ts     # `seed-project` subcommand — resolves env → seedProjectCommand
│   └── commands/                   # Core business logic (no CLI/citty imports)
│       ├── index.ts                # Barrel
│       ├── helpers.ts              # createAuthenticatedClients() + createStepRunner()
│       ├── seed-node/index.ts      # seedNodeCommand — idempotent node provisioning + file output
│       └── seed-project/index.ts   # seedProjectCommand — idempotent project creation
├── test/
│   ├── unit/index.spec.ts          # Build-output smoke test
│   └── vitest.config.ts            # Vitest config (80% coverage thresholds)
├── dist/                           # Build output (tsdown) — gitignored
├── Dockerfile                      # Multi-stage build; CLI as the image entrypoint
├── tsdown.config.ts                # Build config — two entries; runtime deps externalized (resolved from node_modules)
├── eslint.config.js                # @tada5hi/eslint-config
├── tsconfig.json                   # extends @tada5hi/tsconfig
└── package.json
```

## Module Responsibilities

| Module                            | Purpose                                                                                       |
|-----------------------------------|-----------------------------------------------------------------------------------------------|
| `src/index.ts`                    | Library entry; re-exports `seedNodeCommand`, `seedProjectCommand`, and their `*Options` types  |
| `src/cli/index.ts`                | Executable bin; runs citty `runMain`, disables TLS verification, exits non-zero on failure     |
| `src/cli/module.ts`               | Defines the root `hub-seeder` command (name/version/description from `package.json`) + subcommands |
| `src/cli/commands/seed-node.ts`   | citty `seed-node` subcommand; resolves `--node-name`/`NODE_NAME` + env, delegates to `seedNodeCommand` |
| `src/cli/commands/seed-project.ts`| citty `seed-project` subcommand; resolves env, delegates to `seedProjectCommand`               |
| `src/commands/helpers.ts`         | `createAuthenticatedClients()` (Hub + Authup clients sharing one auth hook) and `createStepRunner()` |
| `src/commands/seed-node/index.ts` | Idempotent node provisioning: create node, assign registry, generate keys, set OAuth client, write files |
| `src/commands/seed-project/index.ts` | Idempotent project creation                                                                |

## Key Dependencies

| Dependency                  | Role                                                                                  |
|-----------------------------|---------------------------------------------------------------------------------------|
| `citty`                     | CLI framework — `defineCommand`, `runMain`, subcommands, typed args                    |
| `@privateaim/core-http-kit` | Hub API client (`Client` with `.node`, `.registry`, `.project`, `.projectNode` resources) |
| `@privateaim/core-kit`      | Hub domain types/enums (e.g. `NodeType`)                                               |
| `@privateaim/kit`           | Crypto utilities — `CryptoAsymmetricAlgorithm`, `exportAsymmetricPublicKey/PrivateKey` |
| `@privateaim/server-kit`    | Logger (`createLogger`) + Authup auth hooks (`createAuthupClientAuthenticationHook`, `createAuthupClientTokenCreator`) |
| `@authup/core-http-kit`     | Authup API client — manages the node's OAuth client (secret, redirect URI)            |

## Package Exports

```json
{
  "bin":   { "hub-seeder": "./dist/cli/index.mjs" },
  "main":  "dist/index.mjs",
  "types": "dist/index.d.mts",
  "exports": {
    "./package.json": "./package.json",
    ".": { "types": "./dist/index.d.mts", "import": "./dist/index.mjs" }
  }
}
```

The public API is the barrel `src/index.ts` → `src/commands/index.ts`: only `seedNodeCommand`, `seedProjectCommand`, and their option interfaces are exported. Everything under `src/cli/` and the `helpers.ts` internals is not part of the published library surface.

## Separation of Concerns

- **CLI parsing, arg/env resolution, TLS bootstrap** → `src/cli/`
- **Provisioning business logic (the "steps")** → `src/commands/seed-*/`
- **Client construction, authentication, step orchestration** → `src/commands/helpers.ts`

Core command functions never import `citty` or read `process.argv`; they accept a typed `*Options` object and read only the environment variables they need. This keeps `src/commands/` callable as a library and testable without the CLI.

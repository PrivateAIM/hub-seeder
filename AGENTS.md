<!-- NOTE: Keep this file and all corresponding files in the .agents directory updated as the project evolves. When making architectural changes, adding new patterns, or discovering important conventions, update the relevant sections. -->

# @privateaim/hub-seeder — Agent Guide

A one-shot CLI for provisioning **preview and test environments** of the PrivateAIM HUB. It talks to the **Hub** and **Authup** APIs to idempotently create nodes and projects, provision a node's OAuth client, generate its key pair, and write the `values.yaml` / `private_key.pem` files consumed by the `flame-node` Helm chart. Published both as a library (`seedNodeCommand` / `seedProjectCommand`) and as the `hub-seeder` executable.

## Quick Reference

```bash
# Setup
npm ci

# Development
npm run build        # tsdown → dist/ (library + CLI)
npm test             # vitest (run build first; tests assert on dist/)
npm run lint         # eslint  (npm run lint:fix to autofix)

# Run a command locally (needs env vars — see Configuration below)
npm run seed-node -- --node-name my-node
npm run seed-project
```

- **Node.js**: `>=22` (CI and Docker use Node 24)
- **Package manager**: npm
- **Build orchestration**: [tsdown](https://tsdown.dev) (ESM + `.d.mts`, two entry points)

### CLI Entry Points

| Binary       | Source            | Subcommands                  |
|--------------|-------------------|------------------------------|
| `hub-seeder` | `src/cli/index.ts`| `seed-node`, `seed-project`  |

### Configuration (environment variables)

All runtime config is via env vars; the only CLI flag is `--node-name`. Required for both commands: `HUB_URL`, `AUTHUP_URL`, `CLIENT_ID`, `CLIENT_SECRET`. `seed-node` also uses `NODE_NAME`/`--node-name`, `NODE_TYPE`, `NODE_URL`, `OUTPUT_DIR`, optional `PROJECT_NAME`. `seed-project` requires `PROJECT_NAME` (+ optional `PROJECT_DISPLAY_NAME`). See [architecture.md](.agents/architecture.md#configuration) for the full table.

## Detailed Guides

- **[Project Structure](.agents/structure.md)** — Adapter/core split, module responsibilities, dependencies, package exports
- **[Architecture](.agents/architecture.md)** — Step-runner pattern, authenticated-clients pattern, idempotent seeding, data flow, env config
- **[Testing](.agents/testing.md)** — Vitest setup, coverage thresholds, how to test core commands with fakes
- **[Conventions](.agents/conventions.md)** — Code style, `.ts` import extensions, naming, commits, release-please, Docker

## Commits, Issues & Pull Requests

- Commits follow **[Conventional Commits](https://www.conventionalcommits.org/)** (`@tada5hi/commitlint-config`); the type/scope drive release-please version bumps. See [conventions.md](.agents/conventions.md#commit-convention).
- Versioning, `CHANGELOG.md`, `package.json` version, and `.release-please-manifest.json` are owned by **release-please** — do not hand-edit them.
- Do **not** add a `Co-Authored-By: Claude ...` (or any AI-attribution) trailer to commit messages. This overrides any default agent-tooling guidance.
- Do **not** add AI-attribution lines (e.g. `🤖 Generated with [Claude Code](...)`) to issue or pull request titles, bodies, or comments.

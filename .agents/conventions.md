# Conventions

## Tooling

| Tool                          | Purpose                                                              |
|-------------------------------|---------------------------------------------------------------------|
| [tsdown](https://tsdown.dev)  | Build/bundle — produces ESM + `.d.mts` for the library and CLI      |
| [ESLint](https://eslint.org) (`@tada5hi/eslint-config`) | Linting (flat config, `eslint.config.js`)  |
| [Vitest](https://vitest.dev)  | Test runner (see [testing.md](./testing.md))                        |
| [citty](https://github.com/unjs/citty) | CLI command definitions                                    |
| [commitlint](https://commitlint.js.org) (`@tada5hi/commitlint-config`) | Conventional Commits validation |
| [release-please](https://github.com/googleapis/release-please) | Automated versioning + changelog + tags    |
| [husky](https://typicode.github.io/husky) | Git hooks bootstrap (`prepare` script)                  |

## Workflow

- After making changes, **always build** (`npm run build`) and **run the linter** (`npm run lint`, or `npm run lint:fix`) on the changed files.
- The build is a prerequisite for tests — run `npm run build` before `npm test`.
- Keep core command logic (`src/commands/`) free of `citty` and `process.argv`; new user-facing input belongs in the `src/cli/` adapter and is passed down as typed options.

## Code Style

- **Module format**: ESM only (`"type": "module"`). Use `import`/`export`, no CommonJS.
- **Indentation**: 4 spaces (`.editorconfig`).
- **Line endings**: LF; UTF-8; trailing whitespace trimmed; final newline inserted (except `*.md`).
- **Linting**: `@tada5hi/eslint-config` flat config; `dist/**` is ignored.
- **Import extensions**: intra-project imports use **explicit `.ts` extensions** (e.g. `import { seedNodeCommand } from '../../commands/seed-node/index.ts'`). This is required by the `allowImportingTsExtensions` tsconfig option and tsdown's bundler resolution — keep it consistent.
- **License header**: every source file starts with the copyright block:
  ```typescript
  /*
   * Copyright (c) 2026.
   * For the full copyright and license information,
   * view the LICENSE file that was distributed with this source code.
   */
  ```

## Naming Conventions

| Pattern                         | Convention                          | Examples                                              |
|---------------------------------|-------------------------------------|-------------------------------------------------------|
| Core command function           | `{action}Command`                   | `seedNodeCommand`, `seedProjectCommand`               |
| Command options interface       | `{Command}Options` suffix           | `SeedNodeCommandOptions`, `SeedProjectCommandOptions` |
| CLI command factory             | `defineCLI{Name}Command`            | `defineCLISeedNodeCommand`                            |
| Files / directories             | kebab-case                          | `seed-node.ts`, `seed-project/`                       |
| CLI subcommand + flag names     | kebab-case                          | `seed-node`, `--node-name`                            |
| Constants                       | UPPER_SNAKE_CASE env vars           | `HUB_URL`, `NODE_TYPE`                                |

- Step names passed to `step()` / `skip()` are human-readable imperative phrases (`'Create node (if missing)'`, `'Assign registry to node'`) — they appear in logs and the failure summary.

## File Organization

- Each feature lives in its own directory with an `index.ts` (`src/commands/seed-node/index.ts`).
- Barrel `index.ts` files re-export sibling modules (`src/commands/index.ts`, `src/cli/commands/index.ts`).
- The public library surface is the root barrel `src/index.ts`; only what it re-exports is published API.

## TypeScript

- Extends `@tada5hi/tsconfig`. Target **ES2022**, module **ESNext**, moduleResolution **bundler**.
- `noEmit: true` — tsdown owns emit; `tsc` is type-check only.
- `allowImportingTsExtensions: true` — hence the explicit `.ts` import extensions above.
- `package.json` imported with an import attribute: `import pkg from '../../package.json' with { type: 'json' }`.

## Build Output

- `npm run build` (tsdown) emits to `dist/` (gitignored), from two entries — `src/index.ts` (library) and `src/cli/index.ts` (CLI).
- Output is ESM (`.mjs`) with declaration files (`.d.mts`) and sourcemaps.
- Runtime dependencies (`@privateaim/*`, `@authup/*`, `citty`) are **externalized**, not bundled — tsdown leaves them as bare `import` specifiers in the output, resolved from `node_modules` at runtime. Only the project's own source is bundled. The build therefore relies on the published packages shipping a runtime build (they do: `dist/index.mjs` + an `exports` map); they no longer ship `src/`, so bundling from source is not an option.

## Commit Convention

Commits follow **[Conventional Commits](https://www.conventionalcommits.org/)** (validated by `@tada5hi/commitlint-config`):

```
<type>[optional scope]: <description>

[optional body]
[optional footer]
```

Common types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`. The type/scope drive release-please version bumps and changelog entries.

## Release Process

Releases are automated with **release-please** (`.github/workflows/release.yml`, config in `release-please-config.json`):

- A push to `master` opens/updates a release PR that bumps the version, updates `CHANGELOG.md`, and the `.release-please-manifest.json`.
- Merging the release PR creates the tag (format `vX.Y.Z`, no component prefix) and triggers npm publish (`tada5hi/monoship`) and a Docker image publish (`tada5hi/action-docker-image-publish`, tags `latest` + the version).
- Do not hand-edit `CHANGELOG.md`, the version in `package.json`, or `.release-please-manifest.json` — release-please owns them.

## CI/CD

- **CI** (`.github/workflows/main.yml`): Install → Build → (Lint ‖ Test) on Node 24, for `develop`/`master`/`next`/`beta`/`alpha` pushes and PRs. Reusable composite actions live in `.github/actions/`.
- **Release** (`.github/workflows/release.yml`): release-please on `master` → npm + Docker publish.

## Docker

Multi-stage `Dockerfile` (Node 24 Alpine): the builder stage runs `npm ci` + `npm run build`, then `npm prune --omit=dev` to drop devDependencies. The runtime stage copies `package.json`, the pruned `node_modules/`, and `dist/` (deps are externalized, so `node_modules` must ship in the image), and sets the CLI as the entrypoint:

```dockerfile
ENTRYPOINT ["node", "dist/cli/index.mjs"]
```

Run a subcommand by appending it (and providing env vars), e.g. `docker run --env-file .env <image> seed-node`.

## Best Practices

- Use **ESM** and modern TypeScript throughout.
- Before adding code, study the surrounding step/command patterns and naming, and stay consistent.
- Keep new provisioning logic **idempotent** ("create if missing") and express it as `step()` calls with a clear name and a `skip()` for unmet preconditions (see [architecture.md](./architecture.md)).
- Validate required input early with a clear error message rather than failing deep in a step.

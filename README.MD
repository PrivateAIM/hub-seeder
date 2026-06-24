<p align="center">
  <a href="https://privateaim.net" target="_blank" rel="noopener noreferrer">
    <img src="./.github/assets/logo.svg" alt="FLAME Hub" height="130">
  </a>
</p>

<h1 align="center">Hub Seeder</h1>

<p align="center">
  <b>One-shot provisioning CLI for the FLAME Hub.</b><br>
  Idempotently seeds nodes &amp; projects, provisions OAuth clients, generates key pairs,<br>
  and writes the credential files consumed by the <code>flame-node</code> Helm chart.
</p>

<p align="center">
  <a href="https://github.com/PrivateAIM/hub-seeder/actions/workflows/main.yml"><img src="https://github.com/PrivateAIM/hub-seeder/actions/workflows/main.yml/badge.svg" alt="CI"></a>
  <a href="https://npmjs.com/package/@privateaim/hub-seeder"><img src="https://img.shields.io/npm/v/@privateaim/hub-seeder?logo=npm&logoColor=fff" alt="npm"></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A522-3c873a?logo=node.js&logoColor=fff" alt="node >=22">
  <a href="https://conventionalcommits.org"><img src="https://img.shields.io/badge/Conventional%20Commits-1.0.0-FE5196?logo=conventionalcommits&logoColor=fff" alt="Conventional Commits"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="license"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &nbsp;·&nbsp;
  <a href="#commands">Commands</a> &nbsp;·&nbsp;
  <a href="#configuration">Configuration</a> &nbsp;·&nbsp;
  <a href="#docker">Docker</a> &nbsp;·&nbsp;
  <a href="./CONTRIBUTING.md">Contributing</a>
</p>

---

`hub-seeder` is a one-shot command-line tool for bootstrapping **preview and test environments** of the **[FLAME Hub](https://github.com/PrivateAIM/hub)** ([PrivateAIM](https://privateaim.net)) — a privacy-preserving analytics infrastructure that runs distributed computations across institutional boundaries without moving the underlying data. It talks to the **Hub** and **[Authup](https://authup.org)** APIs to idempotently create nodes and projects, provision a node's OAuth client, generate its key pair, and write the `values.yaml` / `private_key.pem` files consumed by the `flame-node` Helm chart.

It is published both as a **library** (`seedNodeCommand` / `seedProjectCommand`) and as the **`hub-seeder`** executable.

## Features

- 🌱 **Idempotent seeding** — every step is "create if missing", so the seeder is safe to re-run against the same environment.
- 🧩 **Deferred-failure step runner** — runs every step, collects errors with full request/response detail, and reports a complete diagnostic in a single run.
- 🔑 **Credential provisioning** — generates an ECDH P-256 key pair and rotates the node's Authup OAuth client secret &amp; redirect URI.
- 📄 **Chart-ready output** — writes `values.yaml` and `private_key.pem` for the `flame-node` Helm chart.
- 📦 **Library or CLI** — drive it programmatically, from the shell, or as a Docker image.

## Quick Start

### Prerequisites

- **Node.js** 22+
- A reachable **Hub** and **[Authup](https://authup.org)** instance, plus confidential client credentials (`CLIENT_ID` / `CLIENT_SECRET`).

### Install

```bash
npm install @privateaim/hub-seeder
```

Or run it ad-hoc, without installing:

```bash
npx @privateaim/hub-seeder seed-node --node-name my-node
```

## Commands

All configuration is provided via environment variables (see [Configuration](#configuration)); the only CLI flag is `--node-name`.

| Command | Description |
|---------|-------------|
| **`seed-node`** 🌐 | Provision a node on the Hub and write credential files for the `flame-node` chart |
| **`seed-project`** 📁 | Create a project on the Hub (if missing) |

### `seed-node`

Creates the node (if missing), assigns the default registry, generates an ECDH P-256 key pair and sets the node's public key, provisions its Authup OAuth client (secret + redirect URI derived from `NODE_URL`), optionally assigns it to a project, and — only if every step succeeded — writes `values.yaml` and `private_key.pem` to `OUTPUT_DIR`.

```bash
HUB_URL=https://hub.example AUTHUP_URL=https://authup.example \
CLIENT_ID=seeder CLIENT_SECRET=*** \
NODE_TYPE=default NODE_URL=https://my-node.example OUTPUT_DIR=./out \
  hub-seeder seed-node --node-name my-node
```

### `seed-project`

Creates a project on the Hub (if missing).

```bash
HUB_URL=https://hub.example AUTHUP_URL=https://authup.example \
CLIENT_ID=seeder CLIENT_SECRET=*** \
PROJECT_NAME=my-project \
  hub-seeder seed-project
```

## Configuration

| Variable | Used by | Description |
|----------|---------|-------------|
| `HUB_URL` | both | Hub API base URL |
| `AUTHUP_URL` | both | Authup API base URL |
| `REALM` | both | Authup realm for the client-credentials token (default `master`) |
| `CLIENT_ID` | both **(required)** | Confidential client id used to authenticate |
| `CLIENT_SECRET` | both **(required)** | Confidential client secret |
| `NODE_NAME` | seed-node | Node name to create/find (overridden by `--node-name`) |
| `NODE_TYPE` | seed-node | `default` or `aggregator` (default `default`) |
| `NODE_URL` | seed-node | Node base URL; used to derive the OAuth redirect URI (`<url>/**`) |
| `OUTPUT_DIR` | seed-node | Directory for `values.yaml` / `private_key.pem` (default `.`) |
| `PROJECT_NAME` | seed-project **(required)**, seed-node (optional) | Project to create / to assign the node to |
| `PROJECT_DISPLAY_NAME` | seed-project | Project display name (defaults to `PROJECT_NAME`) |

> [!WARNING]
> For self-signed preview/test environments the CLI disables TLS certificate verification (`NODE_TLS_REJECT_UNAUTHORIZED=0`). This is intentional for that use case — do not rely on it in production contexts.

## Programmatic Usage

The core commands are decoupled from the CLI and accept typed options:

```ts
import { seedNodeCommand, seedProjectCommand } from '@privateaim/hub-seeder';

await seedNodeCommand({ nodeName: 'my-node', outputDir: './out' });

await seedProjectCommand({ projectName: 'my-project' });
```

Environment variables (`HUB_URL`, `AUTHUP_URL`, `CLIENT_ID`, …) are read the same way as for the CLI.

## Docker

The CLI ships as a Docker image with the binary as its entrypoint — append the subcommand and provide the environment:

```bash
docker run --env-file .env <image> seed-node
```

## Built With

`hub-seeder` builds on open-source libraries from the FLAME / PrivateAIM ecosystem:
**[Authup](https://authup.org)** (identity &amp; access),
**[citty](https://github.com/unjs/citty)** (CLI framework), and the
**[@privateaim/\*](https://github.com/PrivateAIM/hub)** kits (Hub clients, crypto &amp; server utilities).

## Contributing

Before starting to work on a pull request, it is important to review the guidelines for
[contributing](./CONTRIBUTING.md) and the [code of conduct](./CODE_OF_CONDUCT.md).
These guidelines will help to ensure that contributions are made effectively and are accepted.

## License

Made with 💚

Published under [MIT License](./LICENSE).

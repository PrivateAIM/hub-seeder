/*
 * Copyright (c) 2026.
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Client } from '@privateaim/core-http-kit';
import { NodeType } from '@privateaim/core-kit';
import {
    CryptoAsymmetricAlgorithm,
    exportAsymmetricPrivateKey,
    exportAsymmetricPublicKey,
} from '@privateaim/kit';
import type { Logger } from '@privateaim/server-kit';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { createAuthenticatedClients, createStepRunner } from '../helpers.ts';

function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function resolveNodeType(): NodeType {
    const raw = process.env.NODE_TYPE;
    if (!raw) return NodeType.DEFAULT;
    if (raw === NodeType.AGGREGATOR || raw === NodeType.DEFAULT) return raw;
    throw new Error(
        `Invalid NODE_TYPE value "${raw}". Expected "${NodeType.DEFAULT}" or "${NodeType.AGGREGATOR}".`,
    );
}

async function getNodeClientIdWithRetries(client: Client, nodeId: string, log: Logger) {
    const maxAttempts = 15;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const { data: node } = await client.node.getOne(nodeId);
        if (node.clientId) return node.clientId;
        if (attempt < maxAttempts) {
            log.info(`Waiting for node Authup client assignment (attempt ${attempt}/${maxAttempts})...`);
            await sleep(500);
        }
    }
    throw new Error(`Node ${nodeId} has no client_id after setup; Authup client may not have been assigned.`);
}

async function generateEcdhP256KeyPairPem() {
    const algorithm = new CryptoAsymmetricAlgorithm({ name: 'ECDH', namedCurve: 'P-256' });
    const keyPair = await algorithm.generateKeyPair();
    const publicKeyPem = await exportAsymmetricPublicKey(keyPair.publicKey);
    const privateKeyPem = await exportAsymmetricPrivateKey(keyPair.privateKey);
    return { publicKeyPem, privateKeyPem };
}

function randomClientSecret32(): string {
    return randomBytes(24).toString('base64url');
}

function parseBooleanEnv(name: string): boolean {
    const raw = process.env[name];
    if (!raw) return false;
    return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

export interface ReusableClientSecret {
    secret?: string | null;
    secretHashed?: boolean | null;
    secretEncrypted?: boolean | null;
}

/**
 * A stored client secret can only be handed back to the node when Authup keeps it
 * verbatim. A hashed or encrypted secret is unusable as a credential, so the only
 * way forward in that case is to set a fresh one.
 */
export function canReuseClientSecret(client: ReusableClientSecret): boolean {
    if (!client.secret) return false;
    if (client.secretHashed) return false;
    if (client.secretEncrypted) return false;
    return true;
}

export interface SeedNodeCommandOptions {
    nodeName: string;
    outputDir: string;
    projectName?: string;
}

export async function seedNodeCommand(options: SeedNodeCommandOptions) {
    const { nodeName, projectName } = options;
    const outputDir = path.isAbsolute(options.outputDir) ?
        options.outputDir :
        path.join(process.cwd(), options.outputDir);

    const nodeType = resolveNodeType();
    const nodeUrl = process.env.NODE_URL;
    const rotateCredentials = parseBooleanEnv('ROTATE_CREDENTIALS');

    const {
        hub: client,
        authup: authupHttp,
        log,
    } = createAuthenticatedClients();
    const {
        step,
        skip,
        failures,
    } = createStepRunner(log);

    log.info(`Node (seed): ${nodeName}`);
    log.info(`Node type (seed): ${nodeType}`);
    if (projectName) {
        log.info(`Project (seed): ${projectName}`);
    }

    const externalName = `node_${nodeName.replaceAll(/[^a-zA-Z0-9_-]/g, '_')}`;
    let node = await step('Create node (if missing)', async () => {
        const { data: existingNodes } = await client.node.getMany({ filters: { name: [nodeName] } });
        const existingNode = existingNodes.find((n) => n.name === nodeName);
        if (existingNode) {
            log.info(`Node "${nodeName}" already exists (${existingNode.id}).`);
            return existingNode;
        }
        log.info(`Creating node "${nodeName}" (externalName: ${externalName})...`);
        const { data: createdNode } = await client.node.create({
            name: nodeName,
            externalName,
            type: nodeType,
        });
        log.info(`Created node: ${createdNode.id}`);
        return createdNode;
    });

    if (node) {
        node = await step('Assign registry to node', async () => {
            const defaultRegistryName = 'default';
            const { data: registries } = await client.registry.getMany({ filters: { name: [defaultRegistryName] } });
            const defaultRegistry = registries.find((item) => item.name === defaultRegistryName);
            if (!defaultRegistry) throw new Error(`Registry "${defaultRegistryName}" was not found.`);
            if (node!.registryId !== defaultRegistry.id) {
                log.info(`Assigning registry "${defaultRegistryName}" to node "${node!.name}"...`);
                const { data: updatedNode } = await client.node.update(node!.id, { registryId: defaultRegistry.id });
                return updatedNode;
            }
            log.info(`Node "${node!.name}" already uses registry "${defaultRegistryName}".`);
            return node!;
        }) ?? node;
    } else {
        skip('Assign registry to node', 'Node is unavailable.');
    }

    const clientId = node ?
        await step('Get node client id', async () => getNodeClientIdWithRetries(client, node!.id, log)) :
        (skip('Get node client id', 'Node is unavailable.'), undefined);

    // The Hub only ever stores the public half, so a regenerated pair cannot be
    // reconciled with the private key the node already holds: once a node has a
    // public key, the pair is kept and no private key is written this run.
    let privateKeyPem: string | undefined;
    if (node) {
        await step('Ensure node key pair', async () => {
            if (node!.publicKey && !rotateCredentials) {
                log.info(`Node "${node!.name}" already has a public key; keeping the existing key pair.`);
                return;
            }
            log.info(`Generating ECDH P-256 key pair for node "${node!.name}"`);
            const { publicKeyPem, privateKeyPem: generatedPrivateKeyPem } = await generateEcdhP256KeyPairPem();
            privateKeyPem = generatedPrivateKeyPem;
            log.info(`Setting node "${node!.name}" publicKey from generated key pair...`);
            const { data: updatedNode } = await client.node.update(node!.id, { publicKey: publicKeyPem });
            node = updatedNode;
            log.info(`Node "${node!.name}" publicKey set to: ${publicKeyPem}`);
        });
    } else {
        skip('Ensure node key pair', 'Node is unavailable.');
    }

    let clientSecret: string | undefined;
    if (clientId) {
        await step('Ensure Authup OAuth client secret & redirect URI', async () => {
            // "+secret" is an additive field: Authup omits the secret from the default
            // selection, so it has to be requested explicitly.
            const { data: existingClient } = await authupHttp.client.getOne(clientId, { fields: ['+secret'] });

            if (nodeUrl) {
                const redirectUri = `${nodeUrl.replace(/\/+$/, '')}/**`;
                if (existingClient.redirectUri === redirectUri) {
                    log.info(`Authup OAuth redirect URI for node client ${clientId} is already ${redirectUri}.`);
                } else {
                    log.info(`Setting Authup OAuth redirect URI for node client ${clientId} to ${redirectUri}...`);
                    await authupHttp.client.update(clientId, { redirectUri });
                }
            } else {
                log.warn('NODE_URL env var not set. Skipping Authup OAuth redirect URI update.');
            }

            if (!rotateCredentials && canReuseClientSecret(existingClient)) {
                clientSecret = existingClient.secret!;
                log.info(`Reusing the stored Authup OAuth client secret for node client ${clientId}.`);
                return;
            }
            if (!rotateCredentials && existingClient.secret) {
                log.warn(
                    `Authup stores the secret of client ${clientId} hashed or encrypted, so it cannot be read back. ` +
                    'Setting a new one; the node must pick up the rotated credential.',
                );
            }

            clientSecret = randomClientSecret32();
            log.info(`Setting Authup OAuth client secret for node client ${clientId}...`);
            await authupHttp.client.update(clientId, { secret: clientSecret });
            log.info(`ClientSecret: ${clientSecret?.slice(0, 2)}xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`);
        });
    } else {
        skip('Ensure Authup OAuth client secret & redirect URI', 'Node client id is unavailable.');
    }

    if (projectName && node) {
        await step('Assign node to project', async () => {
            const { data: projects } = await client.project.getMany({ filters: { name: [projectName] } });
            const project = projects.find((p) => p.name === projectName);
            if (!project) {
                throw new Error(`Project "${projectName}" not found. Run seed-project first.`);
            }
            const { data: existing } = await client.projectNode.getMany({ filters: { projectId: [project.id] } });
            const assignedNodeIds = new Set(existing.map((pn) => pn.nodeId));
            if (!assignedNodeIds.has(node!.id)) {
                await client.projectNode.create({ nodeId: node!.id, projectId: project.id });
                log.info(`Assigned node "${node!.name}" to project "${projectName}".`);
            } else {
                log.info(`Node "${node!.name}" already assigned to project "${projectName}".`);
            }
        });
    } else if (projectName) {
        skip('Assign node to project', 'Node is unavailable.');
    }

    if (failures.length > 0) {
        log.error(`Seed failed with ${failures.length} error(s): ${failures.join(', ')}`);
        process.exit(1);
    }

    fs.mkdirSync(outputDir, { recursive: true });

    const valuesYaml = [
        'hub:',
        '  auth:',
        `    clientId: "${clientId}"`,
        'ui:',
        '  idp:',
        `    clientId: "${clientId}"`,
    ].join('\n');

    fs.writeFileSync(path.join(outputDir, 'values.yaml'), `${valuesYaml}\n`, 'utf8');
    log.info(`Wrote ${path.join(outputDir, 'values.yaml')}`);

    fs.writeFileSync(path.join(outputDir, 'clientSecret'), `${clientSecret}`, 'utf8');
    log.info(`Wrote ${path.join(outputDir, 'clientSecret')}`);

    // Written only when this run produced a key pair. On a re-run against a node that
    // already has a public key the file is deliberately absent, which tells the caller
    // to leave the private key the node already holds untouched.
    if (privateKeyPem) {
        fs.writeFileSync(path.join(outputDir, 'private_key.pem'), `${privateKeyPem}\n`, 'utf8');
        log.info(`Wrote ${path.join(outputDir, 'private_key.pem')}`);
    } else {
        log.info(
            `Kept the existing key pair, so no private key was written to ${outputDir}. ` +
            'Set ROTATE_CREDENTIALS=true to replace it.',
        );
    }

    log.info('Node seed completed successfully!');
}

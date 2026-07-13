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
        const node = await client.node.getOne(nodeId);
        if (node.client_id) return node.client_id;
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
        const { data: existingNodes } = await client.node.getMany({ filter: { name: [nodeName] } });
        const existingNode = existingNodes.find((n) => n.name === nodeName);
        if (existingNode) {
            log.info(`Node "${nodeName}" already exists (${existingNode.id}).`);
            return existingNode;
        }
        log.info(`Creating node "${nodeName}" (external_name: ${externalName})...`);
        const createdNode = await client.node.create({
            name: nodeName,
            external_name: externalName,
            type: nodeType,
        });
        log.info(`Created node: ${createdNode.id}`);
        return createdNode;
    });

    if (node) {
        node = await step('Assign registry to node', async () => {
            const defaultRegistryName = 'default';
            const { data: registries } = await client.registry.getMany({ filter: { name: [defaultRegistryName] } });
            const defaultRegistry = registries.find((item) => item.name === defaultRegistryName);
            if (!defaultRegistry) throw new Error(`Registry "${defaultRegistryName}" was not found.`);
            if (node!.registry_id !== defaultRegistry.id) {
                log.info(`Assigning registry "${defaultRegistryName}" to node "${node!.name}"...`);
                return await client.node.update(node!.id, { registry_id: defaultRegistry.id });
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

    let privateKeyPem: string | undefined;
    if (node) {
        await step('Generate key pair and set node public key', async () => {
            log.info(`Generating ECDH P-256 key pair for node "${node!.name}"`);
            const { publicKeyPem, privateKeyPem: generatedPrivateKeyPem } = await generateEcdhP256KeyPairPem();
            privateKeyPem = generatedPrivateKeyPem;
            log.info(`Setting node "${node!.name}" public_key from generated key pair...`);
            node = await client.node.update(node!.id, { public_key: publicKeyPem });
            log.info(`Node "${node!.name}" public_key set to: ${publicKeyPem}`);
        });
    } else {
        skip('Generate key pair and set node public key', 'Node is unavailable.');
    }

    let clientSecret: string | undefined;
    if (clientId) {
        await step('Set Authup OAuth client secret & redirect URI', async () => {
            clientSecret = randomClientSecret32();
            if (nodeUrl) {
                const redirectUri = `${nodeUrl.replace(/\/+$/, '')}/**`;
                log.info(`Setting Authup OAuth redirect URI for node client ${clientId} to ${redirectUri}...`);
                await authupHttp.client.update(clientId, { secret: clientSecret, redirect_uri: redirectUri });
            } else {
                log.warn('NODE_URL env var not set. Skipping Authup OAuth redirect URI update.');
            }
            log.info(`Setting Authup OAuth client secret for node client ${clientId}...`);
            await authupHttp.client.update(clientId, { secret: clientSecret });
        });
    } else {
        skip('Set Authup OAuth client secret & redirect URI', 'Node client id is unavailable.');
    }

    if (projectName && node) {
        await step('Assign node to project', async () => {
            const { data: projects } = await client.project.getMany({ filter: { name: [projectName] } });
            const project = projects.find((p) => p.name === projectName);
            if (!project) {
                throw new Error(`Project "${projectName}" not found. Run seed-project first.`);
            }
            const { data: existing } = await client.projectNode.getMany({ filter: { project_id: [project.id] } });
            const assignedNodeIds = new Set(existing.map((pn) => pn.node_id));
            if (!assignedNodeIds.has(node!.id)) {
                await client.projectNode.create({ node_id: node!.id, project_id: project.id });
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

    fs.writeFileSync(path.join(outputDir, 'clientSecret'), `${clientSecret}\n`, 'utf8');
    log.info(`Wrote ${path.join(outputDir, 'clientSecret')}`);

    fs.writeFileSync(path.join(outputDir, 'private_key.pem'), `${privateKeyPem}\n`, 'utf8');
    log.info(`Wrote ${path.join(outputDir, 'private_key.pem')}`);

    log.info('Node seed completed successfully!');
}

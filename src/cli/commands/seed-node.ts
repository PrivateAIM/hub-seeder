/*
 * Copyright (c) 2026.
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineCommand } from 'citty';
import { seedNodeCommand } from '../../commands/seed-node/index.ts';

export function defineCLISeedNodeCommand() {
    return defineCommand({
        meta: { name: 'seed-node', description: 'Provision a node on the hub and write credential files for the flame-node chart' },
        args: {
            'node-name': {
                type: 'string',
                description: 'Name for the node to create/find (overrides NODE_NAME env var)',
            },
        },
        async run({ args }) {
            const nodeName = args['node-name'] ?? process.env.NODE_NAME;
            if (!nodeName) {
                throw new Error('Node name is required. Pass --node-name or set NODE_NAME.');
            }

            await seedNodeCommand({
                nodeName,
                outputDir: process.env.OUTPUT_DIR ?? '.',
                projectName: process.env.PROJECT_NAME,
            });
        },
    });
}

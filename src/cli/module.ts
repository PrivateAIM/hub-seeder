/*
 * Copyright (c) 2026.
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineCommand } from 'citty';
import pkg from '../../package.json' with { type: 'json' };
import {
    defineCLISeedNodeCommand,
    defineCLISeedProjectCommand,
} from './commands/index.ts';

export async function createCLIEntryPointCommand() {
    return defineCommand({
        meta: {
            name: pkg.name,
            version: pkg.version,
            description: pkg.description,
        },
        subCommands: {
            'seed-node': defineCLISeedNodeCommand(),
            'seed-project': defineCLISeedProjectCommand(),
        },
    });
}

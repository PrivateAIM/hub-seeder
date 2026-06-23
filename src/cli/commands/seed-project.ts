/*
 * Copyright (c) 2026.
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { defineCommand } from 'citty';
import { seedProjectCommand } from '../../commands/seed-project/index.ts';

export function defineCLISeedProjectCommand() {
    return defineCommand({
        meta: { name: 'seed-project', description: 'Create a project on the hub (if missing)' },
        async run() {
            const projectName = process.env.PROJECT_NAME;
            if (!projectName) {
                throw new Error('PROJECT_NAME env var is required.');
            }

            await seedProjectCommand({
                projectName,
                displayName: process.env.PROJECT_DISPLAY_NAME,
            });
        },
    });
}

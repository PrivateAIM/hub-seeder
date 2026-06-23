/*
 * Copyright (c) 2026.
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createAuthenticatedClients, createStepRunner } from '../helpers.ts';

export interface SeedProjectCommandOptions {
    projectName: string;
    displayName?: string;
}

export async function seedProjectCommand(options: SeedProjectCommandOptions) {
    const { projectName } = options;
    const displayName = options.displayName ?? projectName;

    const { hub: client, log } = createAuthenticatedClients();
    const {
        step,
        failures,
    } = createStepRunner(log);

    log.info(`Project name: ${projectName}`);

    await step('Create project (if missing)', async () => {
        const { data: existing } = await client.project.getMany({ filter: { name: [projectName] } });
        const found = existing.find((p) => p.name === projectName);
        if (found) {
            log.info(`Project already exists (${found.id}).`);
            return found;
        }
        log.info('Creating project...');
        const created = await client.project.create({ name: projectName, display_name: displayName });
        log.info(`Created project: ${created.id}`);
        return created;
    });

    if (failures.length > 0) {
        log.error(`Seed-project failed with ${failures.length} error(s): ${failures.join(', ')}`);
        process.exit(1);
    }

    log.info('Project seed completed successfully!');
}

/*
 * Copyright (c) 2026.
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Client as AuthupHttpClient } from '@authup/core-http-kit';
import { Client } from '@privateaim/core-http-kit';
import {
    type Logger,
    createAuthupClientAuthenticationHook,
    createAuthupClientTokenCreator,
    createLogger,
} from '@privateaim/server-kit';

export function logStepError(log: Logger, stepName: string, error: unknown): void {
    const e = error as any;
    log.error(`Step failed: ${stepName}`);
    if (e?.response?.data) {
        log.error(JSON.stringify(e.response.data, null, 2));
        return;
    }
    log.error(`message: ${e?.message ?? 'Unknown error'}`);
    if (e?.stack) log.error(`stack: ${e.stack}`);
    if (e?.cause) log.error(`cause: ${String(e.cause)}`);
    if (e?.request) {
        log.error(`request: ${JSON.stringify({
            method: e.request.method,
            url: e.request.url,
            headers: e.request.headers,
            body: e.request.body,
        }, null, 2)}`);
    }
    if (e?.response) {
        log.error(`response: ${JSON.stringify({
            status: e.response.status,
            statusText: e.response.statusText,
            headers: e.response.headers,
            data: e.response.data,
        }, null, 2)}`);
    }
}

export async function executeStep<T>(
    stepName: string,
    action: () => Promise<T>,
    onError: (stepName: string, error: unknown) => void,
): Promise<T | undefined> {
    try {
        return await action();
    } catch (error) {
        onError(stepName, error);
        return undefined;
    }
}

export function skipStep(log: Logger, failures: string[], stepName: string, reason: string): void {
    failures.push(stepName);
    log.error(`Step skipped: ${stepName}. ${reason}`);
}

export interface AuthenticatedClients {
    hub: Client;
    authup: AuthupHttpClient;
    log: Logger;
}

export function createAuthenticatedClients(): AuthenticatedClients {
    const hubUrl = process.env.HUB_URL;
    const authupUrl = process.env.AUTHUP_URL;
    const realm = process.env.REALM || 'master';

    const log = createLogger();

    log.info(`Connecting to Hub: ${hubUrl}`);
    log.info(`Connecting to Authup: ${authupUrl}`);

    const hub = new Client({ baseURL: hubUrl });
    const authup = new AuthupHttpClient({ baseURL: authupUrl });

    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error(
            'No authentication credentials provided. ' +
            'Set CLIENT_ID + CLIENT_SECRET environment variables.',
        );
    }

    log.info(`Authenticating with client credentials (client: ${clientId})`);
    const tokenCreator = createAuthupClientTokenCreator({
        baseURL: authupUrl,
        clientId,
        clientSecret,
        realm,
    });

    const authHook = createAuthupClientAuthenticationHook({
        baseURL: authupUrl,
        tokenCreator,
        timer: false,
    });
    authHook.attach(hub);
    authHook.attach(authup);

    return {
        hub,
        authup,
        log,
    };
}

export interface StepRunner {
    step: <T>(name: string, action: () => Promise<T>) => Promise<T | undefined>;
    skip: (name: string, reason: string) => void;
    failures: string[];
}

export function createStepRunner(log: Logger): StepRunner {
    const failures: string[] = [];

    const onError = (stepName: string, error: unknown) => {
        failures.push(stepName);
        logStepError(log, stepName, error);
    };

    const step = <T>(name: string, action: () => Promise<T>) =>
        executeStep(name, action, onError);

    const skip = (name: string, reason: string) =>
        skipStep(log, failures, name, reason);

    return {
        step,
        skip,
        failures,
    };
}

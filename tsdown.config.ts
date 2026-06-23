import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsdown';

const root = path.dirname(fileURLToPath(import.meta.url));

function privateaimSrc(name: string) {
    return path.resolve(root, 'node_modules/@privateaim', name, 'src/index.ts');
}

export default defineConfig({
    entry: ['src/index.ts', 'src/cli/index.ts'],
    format: 'esm',
    dts: true,
    sourcemap: true,
    alias: {
        '@privateaim/core-kit': privateaimSrc('core-kit'),
        '@privateaim/core-http-kit': privateaimSrc('core-http-kit'),
        '@privateaim/kit': privateaimSrc('kit'),
        '@privateaim/server-kit': privateaimSrc('server-kit'),
        '@privateaim/telemetry-kit': privateaimSrc('telemetry-kit'),
    },
    deps: {
        onlyBundle: false,
        alwaysBundle: [/^@privateaim\//, /^@authup\//, 'citty'],
    },
});

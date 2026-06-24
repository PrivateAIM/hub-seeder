import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: ['src/index.ts', 'src/cli/index.ts'],
    format: 'esm',
    dts: true,
    sourcemap: true,
    // Runtime deps (package.json "dependencies") are externalized by tsdown's
    // default — only our own source is bundled; they resolve from node_modules
    // at runtime (so the Docker image must ship node_modules). The published
    // @privateaim/* packages ship a dist build and no longer expose src/.
});

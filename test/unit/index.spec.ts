import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('build output', () => {
    it('should produce CLI and library artifacts', () => {
        expect(fs.existsSync('dist/cli/index.mjs')).toBe(true);
        expect(fs.existsSync('dist/index.mjs')).toBe(true);
    });
});

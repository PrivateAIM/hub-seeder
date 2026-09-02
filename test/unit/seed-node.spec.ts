/*
 * Copyright (c) 2026.
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';

import { canReuseClientSecret } from '../../src/commands/seed-node/index.ts';

describe('canReuseClientSecret', () => {
    it('should reuse a secret Authup stores verbatim', () => {
        expect(canReuseClientSecret({
            secret: 'abc', 
            secretHashed: false, 
            secretEncrypted: false, 
        })).toBe(true);
    });

    it('should not reuse a hashed secret', () => {
        expect(canReuseClientSecret({
            secret: 'abc', 
            secretHashed: true, 
            secretEncrypted: false, 
        })).toBe(false);
    });

    it('should not reuse an encrypted secret', () => {
        expect(canReuseClientSecret({
            secret: 'abc', 
            secretHashed: false, 
            secretEncrypted: true, 
        })).toBe(false);
    });

    it('should not reuse a client that has no secret', () => {
        expect(canReuseClientSecret({
            secret: null, 
            secretHashed: false, 
            secretEncrypted: false, 
        })).toBe(false);
        expect(canReuseClientSecret({})).toBe(false);
    });
});

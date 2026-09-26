import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest is configured for the pure domain layer only — no jsdom, no React Testing Library.
 * Everything worth asserting in this project (order rules, tool-arg validation, the intent
 * boundary, menu integrity, rate limiting) is deliberately free of React and I/O, so the
 * suite runs in a Node environment in milliseconds with no extra dependencies.
 */
export default defineConfig({
    resolve: {
        // Mirrors the "@/*" path alias in tsconfig.json for any future component tests.
        alias: { '@': path.resolve(__dirname, '.') },
    },
    test: {
        environment: 'node',
        include: ['**/*.{test,spec}.{ts,tsx}'],
        exclude: ['**/node_modules/**', '**/.next/**'],
    },
});

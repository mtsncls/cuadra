import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      exclude: [
        'coverage/**',
        '**/*.d.ts',
        '**/dist/**',
        '**/node_modules/**',
        'mcp/**',
        '.github/**',
        'qa/**',
        'scripts/**',
        'docs/**',
      ],
    },
  },
});

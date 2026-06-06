import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', '.worktrees/**', 'convex/_generated/**', 'coverage/**', 'e2e/**', '**/__tests__/helpers/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: [
        'lib/**/*.ts',
        'components/**/*.tsx',
        'app/**/*.tsx',
        'app/api/**/*.ts',
      ],
      exclude: [
        'convex/_generated/**',
        '.worktrees/**',
        '**/*.d.ts',
        '**/node_modules/**',
        'components/kibo-ui/**',
        'app/layout.tsx',
        'components/ConvexClientProvider.tsx',
        'app/sign-in/**',
        'app/sign-up/**',
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
})

import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { environment: 'node', include: ['tests/e2e/**/*.e2e.ts'], testTimeout: 120000, fileParallelism: false } })

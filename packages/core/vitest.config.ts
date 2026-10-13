import { defineConfig } from 'vitest/config'

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://wortwerk:wortwerk@localhost:5434/wortwerk_test'
process.env.DATABASE_URL = testDatabaseUrl

export default defineConfig({
  test: {
    globalSetup: ['./test/setup.ts'],
    env: { DATABASE_URL: testDatabaseUrl },
    fileParallelism: false,
  },
})

import { defineConfig } from 'vitest/config'

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://wortwerk:wortwerk@localhost:5434/wortwerk_test'

export default defineConfig({
  test: {
    globalSetup: ['../core/test/setup.ts'],
    env: {
      DATABASE_URL: testDatabaseUrl,
      BETTER_AUTH_SECRET: 'test-secret-test-secret',
      APP_URL: 'http://wortwerk.test',
      OPENROUTER_API_KEY: '',
      GITHUB_APP_ID: '',
      BITBUCKET_CLIENT_ID: '',
    },
    fileParallelism: false,
  },
})

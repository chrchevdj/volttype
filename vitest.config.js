const { defineConfig } = require('vitest/config');
const path = require('path');

module.exports = defineConfig({
  resolve: {
    alias: {
      electron: path.resolve(__dirname, 'tests/mocks/electron.js'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      include: [
        'src/**/*.js',
        'backend/cloudflare-worker/src/**/*.js',
      ],
      exclude: [
        'renderer/**',
        'website/**',
        'pwa/**',
        'main.js',
        'preload.js',
        'start.js',
        '**/*.test.js',
        'tests/**',
      ],
    },
  },
});

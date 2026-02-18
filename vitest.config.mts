import { defineConfig } from 'vitest/config'

/**
 * https://vitest.dev/config/
 */
export default defineConfig({
	test: {
		include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
		exclude: ['**/node_modules/**', '**/dist/**'],
		environment: 'node',
		testTimeout: 10000,
		watch: false,
		globals: true,
	},
})

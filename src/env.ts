import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export const env = createEnv({
	clientPrefix: '',

	client: {
		ADMIN_API_KEY: z.string().min(1),
		PORT: z.string().default('3010'),
		ENV: z.enum(['development', 'production', 'test']).default('development'),
		POSTHOG_HOST: z.string().default('eu.i.posthog.com'),
		POSTHOG_ASSETS_HOST: z.string().default('eu-assets.i.posthog.com'),
		SSL_CERT_PATH: z.string().optional(),
		SSL_KEY_PATH: z.string().optional(),
	},

	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
})

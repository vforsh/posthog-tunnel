import { cors } from '@elysiajs/cors'
import { Elysia } from 'elysia'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { type BlocklistData, findToken, isTokenBlocked, loadBlocklist, saveBlocklist } from './blocklist'
import { getRequestHost, isDomainBlocked } from './domain-check'
import { env } from './env'
import { extractToken, forwardRequest } from './proxy'

// Blocklist setup
const BLOCKLIST_PATH = resolve(import.meta.dir, '..', 'blocklist.json')
const blocklist: BlocklistData = loadBlocklist(BLOCKLIST_PATH)

// Environment settings
const isDev = env.ENV === 'development'

// SSL setup
const certPath = env.SSL_CERT_PATH
const keyPath = env.SSL_KEY_PATH
const useHttps = Boolean(certPath && keyPath)

function ts(): string {
	const now = new Date()
	return `${now.toISOString()} [${now.toLocaleTimeString([], { hour12: false })}]`
}

function devLog(...args: any[]) {
	if (isDev) console.log(`${ts()} [DEV]`, ...args)
}

// TLS config
let tlsConfig: { cert: any; key: any } | undefined

if (useHttps && certPath && keyPath) {
	if (!existsSync(certPath) || !existsSync(keyPath)) {
		console.error(`${ts()} SSL cert/key not found`)
		process.exit(1)
	}
	tlsConfig = { cert: Bun.file(certPath), key: Bun.file(keyPath) }
	console.log(`${ts()} SSL loaded`)
}

// Auth guard
function isAuthorized(headers: Record<string, string | undefined>): boolean {
	return headers['authorization'] === `Bearer ${env.ADMIN_API_KEY}`
}

/**
 * Check if a request should be blocked based on token + domain blocklist.
 * Returns an error message if blocked, or null if allowed.
 */
function checkBlocked(token: string | null, request: Request): string | null {
	// Check global domain blocklist first
	const host = getRequestHost(request)
	if (host && isDomainBlocked(host, blocklist.globalBlockedDomains)) {
		return `Domain blocked globally: ${host}`
	}

	// No token → allow (allow-all default)
	if (!token) return null

	// Check token blocklist
	if (!isTokenBlocked(blocklist, token)) return null

	const entry = findToken(blocklist, token)!

	// Check per-token domain blocklist
	if (host && isDomainBlocked(host, entry.blockedDomains)) {
		return `Domain blocked for token ${token}: ${host}`
	}

	// Token is in blocklist → reject
	return `Token blocked: ${token}`
}

// Proxy handler shared by ingest routes
async function handleProxy(request: Request, path: string, targetHost: string): Promise<Response> {
	const requestId = Math.random().toString(36).substring(2, 10)
	const url = new URL(request.url)
	devLog(`[${requestId}] ${request.method} ${url.pathname}`)

	try {
		// Buffer body for token extraction
		let body: unknown = null
		if (request.method === 'POST') {
			const ct = request.headers.get('content-type') || ''
			if (ct.includes('application/json')) {
				body = await request.json()
			} else {
				body = await request.text()
			}
		}

		const token = extractToken(url, request.method, body)
		devLog(`[${requestId}] token=${token ?? '(none)'}`)

		const blocked = checkBlocked(token, request)
		if (blocked) {
			devLog(`[${requestId}] ${blocked}`)
			return new Response(JSON.stringify({ error: blocked }), {
				status: 403,
				headers: { 'content-type': 'application/json' },
			})
		}

		const startTime = Date.now()
		const response = await forwardRequest({
			targetHost,
			method: request.method,
			path,
			queryString: url.search.slice(1),
			headers: request.headers,
			body,
		})
		devLog(`[${requestId}] → ${response.status} (${Date.now() - startTime}ms)`)

		return response
	} catch (error) {
		console.error(`${ts()} [${requestId}] proxy error:`, error)
		return new Response(
			JSON.stringify({ error: 'Internal server error', message: error instanceof Error ? error.message : String(error) }),
			{ status: 500, headers: { 'content-type': 'application/json' } },
		)
	}
}

export const app = new Elysia({
	serve: {
		port: parseInt(env.PORT),
		...(tlsConfig ? { tls: tlsConfig } : {}),
	},
})
	.use(cors())
	.get('/', () => 'PostHog Tunnel is running')
	.get('/health', () => ({
		status: 'healthy',
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
	}))

	// ── Proxy routes ──────────────────────────────────────────────────
	.all('/ingest/*', ({ request }) => {
		const url = new URL(request.url)
		// Strip /ingest prefix
		const path = url.pathname.replace(/^\/ingest/, '') || '/'
		return handleProxy(request, path, env.POSTHOG_HOST)
	})
	.get('/static/*', ({ request }) => {
		const url = new URL(request.url)
		return handleProxy(request, url.pathname, env.POSTHOG_ASSETS_HOST)
	})

	// ── Admin: tokens ─────────────────────────────────────────────────
	.get('/admin/tokens', ({ headers, set }) => {
		if (!isAuthorized(headers)) {
			set.status = 401
			return { error: 'Unauthorized' }
		}
		return blocklist.tokens
	})
	.post('/admin/tokens', ({ headers, set, body }) => {
		if (!isAuthorized(headers)) {
			set.status = 401
			return { error: 'Unauthorized' }
		}

		const { token, label } = body as { token?: string; label?: string }
		if (!token) {
			set.status = 400
			return { error: 'Missing token' }
		}
		if (!label) {
			set.status = 400
			return { error: 'Missing label' }
		}

		const existing = findToken(blocklist, token)
		if (existing) {
			existing.label = label
		} else {
			blocklist.tokens.push({ token, label, blockedDomains: [] })
		}
		saveBlocklist(BLOCKLIST_PATH, blocklist)

		set.status = 201
		return findToken(blocklist, token)
	})
	.delete('/admin/tokens/:token', ({ headers, set, params }) => {
		if (!isAuthorized(headers)) {
			set.status = 401
			return { error: 'Unauthorized' }
		}

		const idx = blocklist.tokens.findIndex((t) => t.token === params.token)
		if (idx === -1) {
			set.status = 404
			return { error: `Token ${params.token} not found` }
		}

		blocklist.tokens.splice(idx, 1)
		saveBlocklist(BLOCKLIST_PATH, blocklist)
		return { ok: true }
	})

	// ── Admin: global domains ─────────────────────────────────────────
	.get('/admin/domains', ({ headers, set }) => {
		if (!isAuthorized(headers)) {
			set.status = 401
			return { error: 'Unauthorized' }
		}
		return blocklist.globalBlockedDomains
	})
	.post('/admin/domains', ({ headers, set, body }) => {
		if (!isAuthorized(headers)) {
			set.status = 401
			return { error: 'Unauthorized' }
		}

		const { domain } = body as { domain?: string }
		if (!domain) {
			set.status = 400
			return { error: 'Missing domain' }
		}

		if (!blocklist.globalBlockedDomains.includes(domain)) {
			blocklist.globalBlockedDomains.push(domain)
			saveBlocklist(BLOCKLIST_PATH, blocklist)
		}

		set.status = 201
		return { ok: true }
	})
	.delete('/admin/domains/:domain', ({ headers, set, params }) => {
		if (!isAuthorized(headers)) {
			set.status = 401
			return { error: 'Unauthorized' }
		}

		const idx = blocklist.globalBlockedDomains.indexOf(params.domain)
		if (idx === -1) {
			set.status = 404
			return { error: `Domain ${params.domain} not found` }
		}

		blocklist.globalBlockedDomains.splice(idx, 1)
		saveBlocklist(BLOCKLIST_PATH, blocklist)
		return { ok: true }
	})

	// ── Admin: per-token domains ──────────────────────────────────────
	.post('/admin/tokens/:token/blocked-domains', ({ headers, set, params, body }) => {
		if (!isAuthorized(headers)) {
			set.status = 401
			return { error: 'Unauthorized' }
		}

		const entry = findToken(blocklist, params.token)
		if (!entry) {
			set.status = 404
			return { error: `Token ${params.token} not found` }
		}

		const { domain } = body as { domain?: string }
		if (!domain) {
			set.status = 400
			return { error: 'Missing domain' }
		}

		if (!entry.blockedDomains.includes(domain)) {
			entry.blockedDomains.push(domain)
			saveBlocklist(BLOCKLIST_PATH, blocklist)
		}

		return entry
	})
	.delete('/admin/tokens/:token/blocked-domains/:domain', ({ headers, set, params }) => {
		if (!isAuthorized(headers)) {
			set.status = 401
			return { error: 'Unauthorized' }
		}

		const entry = findToken(blocklist, params.token)
		if (!entry) {
			set.status = 404
			return { error: `Token ${params.token} not found` }
		}

		const idx = entry.blockedDomains.indexOf(params.domain)
		if (idx === -1) {
			set.status = 404
			return { error: `Domain ${params.domain} not found` }
		}

		entry.blockedDomains.splice(idx, 1)
		saveBlocklist(BLOCKLIST_PATH, blocklist)
		return { ok: true }
	})
	.listen(parseInt(env.PORT), () => {
		const protocol = useHttps ? 'https' : 'http'
		console.log(`${ts()} ${useHttps ? '🔒' : '🚀'} PostHog Tunnel running at ${protocol}://localhost:${env.PORT}`)
		console.log(`${ts()} 🌍 Environment: ${env.ENV}`)
		console.log(`${ts()} 🎯 PostHog host: ${env.POSTHOG_HOST}`)
		console.log(
			`${ts()} 🚫 Blocked tokens: ${blocklist.tokens.length > 0 ? blocklist.tokens.map((t) => t.token).join(', ') : 'None (all traffic allowed)'}`,
		)
		if (blocklist.globalBlockedDomains.length > 0) {
			console.log(`${ts()} 🌐 Global blocked domains: ${blocklist.globalBlockedDomains.join(', ')}`)
		}
	})

export type App = typeof app

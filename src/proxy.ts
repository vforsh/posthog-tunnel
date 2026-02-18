const ARRAY_CONFIG_RE = /\/array\/([^/]+)\/config/

/**
 * Extract PostHog API key from URL only (query params + path).
 * Returns null if not found — caller may need to check body.
 */
export function extractApiKeyFromUrl(url: URL): string | null {
	const qKey = url.searchParams.get('token') || url.searchParams.get('_')
	if (qKey) return qKey

	const pathMatch = url.pathname.match(ARRAY_CONFIG_RE)
	if (pathMatch) return pathMatch[1]!

	return null
}

/**
 * Extract PostHog API key from a raw body string (JSON only).
 */
export function extractApiKeyFromBody(bodyText: string): string | null {
	try {
		const obj = JSON.parse(bodyText)
		if (obj && typeof obj === 'object') {
			const key = obj.token ?? obj.api_key
			if (typeof key === 'string' && key) return key
		}
	} catch {
		// Not JSON or parse error
	}
	return null
}

type ForwardOptions = {
	targetHost: string
	method: string
	path: string
	queryString: string
	headers: Headers
	body: ReadableStream<Uint8Array> | string | null
}

const FORWARDED_HEADERS = ['content-type', 'user-agent', 'accept', 'accept-encoding'] as const

/**
 * Forward a request to PostHog and return the response.
 */
export async function forwardRequest(opts: ForwardOptions): Promise<Response> {
	const { targetHost, method, path, queryString, headers, body } = opts
	const qs = queryString ? `?${queryString}` : ''
	const targetUrl = `https://${targetHost}${path}${qs}`

	const forwardHeaders: Record<string, string> = {}
	for (const key of FORWARDED_HEADERS) {
		const value = headers.get(key)
		if (value) forwardHeaders[key] = value
	}

	const init: RequestInit = {
		method,
		headers: forwardHeaders,
	}

	if (method === 'POST' && body !== null) {
		init.body = body
	}

	return fetch(targetUrl, init)
}

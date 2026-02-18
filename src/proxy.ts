/**
 * Extract PostHog project API key from a request (priority order):
 * 1. Query param `token` or `_`
 * 2. URL path match `/array/{apiKey}/config`
 * 3. JSON body field `token` or `api_key` (POST only)
 * 4. Not found → null (allow-all default)
 *
 * Note: field names (`token`, `api_key`, `_`) are PostHog's wire format.
 */
export function extractApiKey(url: URL, method: string, body: unknown): string | null {
	// 1. Query params
	const qKey = url.searchParams.get('token') || url.searchParams.get('_')
	if (qKey) return qKey

	// 2. Path pattern: /ingest/array/{apiKey}/config or /array/{apiKey}/config
	const pathMatch = url.pathname.match(/\/array\/([^/]+)\/config/)
	if (pathMatch) return pathMatch[1]!

	// 3. JSON body (POST only)
	if (method === 'POST' && body && typeof body === 'object') {
		const obj = body as Record<string, unknown>
		const bodyKey = obj.token ?? obj.api_key
		if (typeof bodyKey === 'string' && bodyKey) return bodyKey
	}

	return null
}

type ForwardOptions = {
	targetHost: string
	method: string
	path: string
	queryString: string
	headers: Headers
	body: unknown
}

/**
 * Forward a request to PostHog and return the response.
 */
export async function forwardRequest(opts: ForwardOptions): Promise<Response> {
	const { targetHost, method, path, queryString, headers, body } = opts
	const qs = queryString ? `?${queryString}` : ''
	const targetUrl = `https://${targetHost}${path}${qs}`

	const forwardHeaders: Record<string, string> = {}
	for (const key of ['content-type', 'user-agent', 'accept', 'accept-encoding']) {
		const value = headers.get(key)
		if (value) forwardHeaders[key] = value
	}

	const init: RequestInit = {
		method,
		headers: forwardHeaders,
	}

	if (method === 'POST') {
		if (typeof body === 'string') {
			init.body = body
		} else if (body !== null && body !== undefined) {
			init.body = JSON.stringify(body)
		}
	}

	return fetch(targetUrl, init)
}

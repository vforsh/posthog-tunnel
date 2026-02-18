/**
 * Check if a hostname matches any domain in a Set.
 * Walks up parent domains for subdomain matching
 * (e.g. "sub.example.com" matches "example.com").
 */
export function isDomainBlocked(hostname: string, domainSet: Set<string>): boolean {
	if (domainSet.size === 0) return false
	if (domainSet.has(hostname)) return true

	let dot = hostname.indexOf('.')
	while (dot !== -1) {
		if (domainSet.has(hostname.slice(dot + 1))) return true
		dot = hostname.indexOf('.', dot + 1)
	}

	return false
}

/**
 * Extract the request hostname from Referer or Origin headers.
 */
export function getRequestHost(request: Request): string | null {
	const referer = request.headers.get('referer') || request.headers.get('origin')
	if (!referer) return null

	try {
		return new URL(referer).hostname
	} catch {
		return null
	}
}

/**
 * Check if a hostname matches any domain in the list.
 * Supports exact match and subdomain matching (e.g. "foo.example.com" matches "example.com").
 */
export function isDomainBlocked(hostname: string, blockedDomains: string[]): boolean {
	return blockedDomains.some((d) => hostname === d || hostname.endsWith(`.${d}`))
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

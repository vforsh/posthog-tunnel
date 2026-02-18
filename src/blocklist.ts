import { existsSync, readFileSync, writeFileSync } from 'fs'

export type BlocklistEntry = {
	token: string
	label: string
	blockedDomains: string[]
}

export type BlocklistData = {
	tokens: BlocklistEntry[]
	globalBlockedDomains: string[]
}

export function loadBlocklist(filePath: string): BlocklistData {
	if (!existsSync(filePath)) {
		return { tokens: [], globalBlockedDomains: [] }
	}

	const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<BlocklistData>
	return {
		tokens: (raw.tokens ?? []).map((t) => ({
			token: t!.token!,
			label: t!.label ?? '',
			blockedDomains: t!.blockedDomains ?? [],
		})),
		globalBlockedDomains: raw.globalBlockedDomains ?? [],
	}
}

export function saveBlocklist(filePath: string, data: BlocklistData): void {
	writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n')
}

export function findToken(data: BlocklistData, token: string): BlocklistEntry | undefined {
	return data.tokens.find((t) => t.token === token)
}

export function isTokenBlocked(data: BlocklistData, token: string): boolean {
	return data.tokens.some((t) => t.token === token)
}

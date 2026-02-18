import { existsSync, readFileSync, writeFileSync } from 'fs'

export type BlocklistEntry = {
	apiKey: string
	label: string
	blockedDomains: string[]
}

export type BlocklistData = {
	apiKeys: BlocklistEntry[]
	globalBlockedDomains: string[]
}

export function loadBlocklist(filePath: string): BlocklistData {
	if (!existsSync(filePath)) {
		return { apiKeys: [], globalBlockedDomains: [] }
	}

	const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<BlocklistData>
	return {
		apiKeys: (raw.apiKeys ?? []).map((e) => ({
			apiKey: e!.apiKey!,
			label: e!.label ?? '',
			blockedDomains: e!.blockedDomains ?? [],
		})),
		globalBlockedDomains: raw.globalBlockedDomains ?? [],
	}
}

export function saveBlocklist(filePath: string, data: BlocklistData): void {
	writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n')
}

export function findApiKey(data: BlocklistData, apiKey: string): BlocklistEntry | undefined {
	return data.apiKeys.find((e) => e.apiKey === apiKey)
}

export function isApiKeyBlocked(data: BlocklistData, apiKey: string): boolean {
	return data.apiKeys.some((e) => e.apiKey === apiKey)
}

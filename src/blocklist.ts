import { existsSync, readFileSync } from 'fs'

export type BlocklistEntry = {
	apiKey: string
	label: string
	blockedDomains: string[]
}

export type BlocklistData = {
	apiKeys: BlocklistEntry[]
	globalBlockedDomains: string[]
}

/** Fast-lookup index derived from BlocklistData */
export type BlocklistIndex = {
	apiKeyMap: Map<string, BlocklistEntry>
	globalDomainSet: Set<string>
	perKeyDomainSets: Map<string, Set<string>>
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

/** Build O(1) lookup index from blocklist data. Rebuild after every mutation. */
export function buildIndex(data: BlocklistData): BlocklistIndex {
	const apiKeyMap = new Map<string, BlocklistEntry>()
	const perKeyDomainSets = new Map<string, Set<string>>()

	for (const entry of data.apiKeys) {
		apiKeyMap.set(entry.apiKey, entry)
		perKeyDomainSets.set(entry.apiKey, new Set(entry.blockedDomains))
	}

	return {
		apiKeyMap,
		globalDomainSet: new Set(data.globalBlockedDomains),
		perKeyDomainSets,
	}
}

export async function saveBlocklist(filePath: string, data: BlocklistData): Promise<void> {
	await Bun.write(filePath, JSON.stringify(data, null, 2) + '\n')
}

export function findApiKey(data: BlocklistData, apiKey: string): BlocklistEntry | undefined {
	return data.apiKeys.find((e) => e.apiKey === apiKey)
}

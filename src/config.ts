import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { parse, stringify } from 'smol-toml'

export type PhtunConfig = {
	url?: string
	key?: string
}

const CONFIG_KEYS = ['url', 'key'] as const
export type ConfigKey = (typeof CONFIG_KEYS)[number]

export function isValidKey(key: string): key is ConfigKey {
	return CONFIG_KEYS.includes(key as ConfigKey)
}

export function getConfigDir(): string {
	const xdg = process.env.XDG_CONFIG_HOME || join(process.env.HOME || '~', '.config')
	return join(xdg, 'phtun')
}

export function getConfigPath(): string {
	return join(getConfigDir(), 'config.toml')
}

export function loadConfig(): PhtunConfig {
	const path = getConfigPath()
	if (!existsSync(path)) return {}

	const raw = parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
	return {
		url: typeof raw.url === 'string' ? raw.url : undefined,
		key: typeof raw.key === 'string' ? raw.key : undefined,
	}
}

export function saveConfig(config: PhtunConfig): void {
	const dir = getConfigDir()
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true })
	}

	const clean: Record<string, string> = {}
	if (config.url) clean.url = config.url
	if (config.key) clean.key = config.key

	writeFileSync(getConfigPath(), stringify(clean) + '\n')
}

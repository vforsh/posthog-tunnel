#!/usr/bin/env bun
import { Command } from 'commander'
import { type ConfigKey, getConfigPath, isValidKey, loadConfig, saveConfig } from './config'

// Load .env from project root for defaults
const envPath = new URL('../.env', import.meta.url).pathname
const envFile = Bun.file(envPath)
if (await envFile.exists()) {
	const text = await envFile.text()
	for (const line of text.split('\n')) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) continue
		const eqIdx = trimmed.indexOf('=')
		if (eqIdx === -1) continue
		const key = trimmed.slice(0, eqIdx)
		const value = trimmed.slice(eqIdx + 1)
		if (!process.env[key]) process.env[key] = value
	}
}

// Load TOML config as fallback
const tomlConfig = loadConfig()

const program = new Command()

program
	.name('phtun')
	.description('PostHog Tunnel admin CLI')
	.option('--url <url>', 'Tunnel server URL', process.env.TUNNEL_URL ?? tomlConfig.url ?? 'http://localhost:3010')
	.option('--key <key>', 'Admin API key', process.env.ADMIN_API_KEY ?? tomlConfig.key)

async function request(method: string, path: string, body?: unknown) {
	const opts = program.opts()
	const url = `${opts.url}${path}`
	const key = opts.key

	if (!key) {
		console.error('Error: Admin API key is required. Use --key, set ADMIN_API_KEY, or run `phtun config set key <value>`.')
		process.exit(1)
	}

	const headers: Record<string, string> = {
		'Authorization': `Bearer ${key}`,
	}
	if (body) {
		headers['Content-Type'] = 'application/json'
	}

	const res = await fetch(url, {
		method,
		headers,
		...(body ? { body: JSON.stringify(body) } : {}),
	})

	if (!res.ok) {
		const text = await res.text()
		console.error(`Error ${res.status}: ${text}`)
		process.exit(1)
	}

	return res.json()
}

// ── list ──────────────────────────────────────────────────────────────
program
	.command('list')
	.description('List blocked API keys and global domains')
	.action(async () => {
		const entries = (await request('GET', '/admin/api-keys')) as {
			apiKey: string
			label: string
			blockedDomains: string[]
		}[]
		const domains = (await request('GET', '/admin/domains')) as string[]

		if (entries.length === 0 && domains.length === 0) {
			console.log('Blocklist is empty — all traffic is allowed.')
			return
		}

		if (entries.length > 0) {
			console.log(`${entries.length} blocked API key(s):\n`)
			for (const e of entries) {
				console.log(`  ${e.apiKey} (${e.label})`)
				if (e.blockedDomains?.length > 0) {
					console.log(`    domains: ${e.blockedDomains.join(', ')}`)
				}
			}
		}

		if (domains.length > 0) {
			if (entries.length > 0) console.log()
			console.log(`${domains.length} global blocked domain(s):\n`)
			for (const d of domains) {
				console.log(`  ${d}`)
			}
		}
	})

// ── block / deny ──────────────────────────────────────────────────────
program
	.command('block <api-key>')
	.alias('deny')
	.description('Block a project API key')
	.requiredOption('--label <label>', 'Human-readable label (required)')
	.action(async (apiKey: string, opts: { label: string }) => {
		const entry = (await request('POST', '/admin/api-keys', { apiKey, label: opts.label })) as any
		console.log(`Blocked API key ${entry.apiKey} (${entry.label})`)
	})

// ── unblock / allow ───────────────────────────────────────────────────
program
	.command('unblock <api-key>')
	.alias('allow')
	.description('Unblock a project API key')
	.action(async (apiKey: string) => {
		await request('DELETE', `/admin/api-keys/${encodeURIComponent(apiKey)}`)
		console.log(`Unblocked API key ${apiKey}`)
	})

// ── domain ────────────────────────────────────────────────────────────
const domain = program.command('domain').description('Manage blocked domains')

domain
	.command('list [api-key]')
	.description('List blocked domains (global or per-API-key)')
	.action(async (apiKey?: string) => {
		if (apiKey) {
			const entries = (await request('GET', '/admin/api-keys')) as {
				apiKey: string
				blockedDomains: string[]
			}[]
			const entry = entries.find((e) => e.apiKey === apiKey)
			if (!entry) {
				console.error(`API key ${apiKey} not found in blocklist`)
				process.exit(1)
			}
			if (entry.blockedDomains.length === 0) {
				console.log(`No blocked domains for API key ${apiKey}.`)
				return
			}
			console.log(`Blocked domains for ${apiKey}:\n`)
			for (const d of entry.blockedDomains) {
				console.log(`  ${d}`)
			}
		} else {
			const domains = (await request('GET', '/admin/domains')) as string[]
			if (domains.length === 0) {
				console.log('No global blocked domains.')
				return
			}
			console.log(`${domains.length} global blocked domain(s):\n`)
			for (const d of domains) {
				console.log(`  ${d}`)
			}
		}
	})

domain
	.command('block <args...>')
	.alias('deny')
	.description('Block a domain (1 arg = global, 2 args = per-API-key <api-key> <domain>)')
	.action(async (args: string[]) => {
		if (args.length === 1) {
			await request('POST', '/admin/domains', { domain: args[0] })
			console.log(`Blocked domain globally: ${args[0]}`)
		} else if (args.length === 2) {
			const [apiKey, domainName] = args
			await request('POST', `/admin/api-keys/${encodeURIComponent(apiKey)}/blocked-domains`, { domain: domainName })
			console.log(`Blocked domain ${domainName} for API key ${apiKey}`)
		} else {
			console.error('Usage: phtun domain block <domain> OR phtun domain block <api-key> <domain>')
			process.exit(1)
		}
	})

domain
	.command('unblock <args...>')
	.alias('allow')
	.description('Unblock a domain (1 arg = global, 2 args = per-API-key <api-key> <domain>)')
	.action(async (args: string[]) => {
		if (args.length === 1) {
			await request('DELETE', `/admin/domains/${encodeURIComponent(args[0])}`)
			console.log(`Unblocked domain globally: ${args[0]}`)
		} else if (args.length === 2) {
			const [apiKey, domainName] = args
			await request(
				'DELETE',
				`/admin/api-keys/${encodeURIComponent(apiKey)}/blocked-domains/${encodeURIComponent(domainName)}`,
			)
			console.log(`Unblocked domain ${domainName} for API key ${apiKey}`)
		} else {
			console.error('Usage: phtun domain unblock <domain> OR phtun domain unblock <api-key> <domain>')
			process.exit(1)
		}
	})

// ── config / cfg ──────────────────────────────────────────────────────
const cfg = program.command('config').alias('cfg').description('Manage CLI config')

cfg
	.command('init')
	.description('Create config interactively')
	.action(async () => {
		const readline = await import('readline')
		const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
		const ask = (q: string, def?: string): Promise<string> =>
			new Promise((resolve) => {
				const suffix = def ? ` (${def})` : ''
				rl.question(`${q}${suffix}: `, (answer) => resolve(answer.trim() || def || ''))
			})

		const url = await ask('Server URL', 'http://localhost:3010')
		const key = await ask('Admin API key')
		rl.close()

		saveConfig({ url: url || undefined, key: key || undefined })
		console.log(`Config saved to ${getConfigPath()}`)
	})

cfg
	.command('set <key> <value>')
	.description('Set a config value')
	.action((key: string, value: string) => {
		if (!isValidKey(key)) {
			console.error(`Invalid key: ${key}. Valid keys: url, key`)
			process.exit(1)
		}
		const config = loadConfig()
		config[key as ConfigKey] = value
		saveConfig(config)
		console.log(`Set ${key} = ${key === 'key' ? '***' : value}`)
	})

cfg
	.command('get [key]')
	.description('Show config values')
	.action((key?: string) => {
		const config = loadConfig()
		if (key) {
			if (!isValidKey(key)) {
				console.error(`Invalid key: ${key}. Valid keys: url, key`)
				process.exit(1)
			}
			const val = config[key as ConfigKey]
			console.log(val ?? '(not set)')
		} else {
			const path = getConfigPath()
			console.log(`Config: ${path}\n`)
			console.log(`  url = ${config.url ?? '(not set)'}`)
			console.log(`  key = ${config.key ? '***' : '(not set)'}`)
		}
	})

cfg
	.command('path')
	.description('Print config file path')
	.action(() => {
		console.log(getConfigPath())
	})

program.parse()

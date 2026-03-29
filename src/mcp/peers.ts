import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";

const PeerConfigSchema = z.object({
	url: z.string().url(),
	token: z.string().min(1),
	description: z.string().optional(),
	enabled: z.boolean().default(true),
});

const PeersConfigSchema = z.record(z.string(), PeerConfigSchema);

export type PeerConfig = z.infer<typeof PeerConfigSchema>;

export type PeerMcpServerConfig = {
	type: "url";
	url: string;
	headers: Record<string, string>;
};

export type PeerInfo = {
	name: string;
	url: string;
	description: string;
	enabled: boolean;
};

export class PeerManager {
	private peers: Map<string, PeerConfig> = new Map();

	loadFromConfig(configPath = "config/phantom.yaml"): void {
		if (!existsSync(configPath)) return;

		try {
			const { parse } = require("yaml") as typeof import("yaml");
			const raw = readFileSync(configPath, "utf-8");
			const parsed = parse(raw);

			if (!parsed?.peers || typeof parsed.peers !== "object") return;

			const result = PeersConfigSchema.safeParse(parsed.peers);
			if (!result.success) {
				const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
				console.warn(`[peers] Invalid peers config:\n${issues}`);
				return;
			}

			for (const [name, config] of Object.entries(result.data)) {
				if (config.enabled) {
					this.peers.set(name, config);
				}
			}

			if (this.peers.size > 0) {
				console.log(`[peers] Loaded ${this.peers.size} peer(s): ${Array.from(this.peers.keys()).join(", ")}`);
			}
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			console.warn(`[peers] Failed to load peer config: ${msg}`);
		}
	}

	addPeer(name: string, config: PeerConfig): void {
		const parsed = PeerConfigSchema.parse(config);
		this.peers.set(name, parsed);
	}

	removePeer(name: string): boolean {
		return this.peers.delete(name);
	}

	getPeer(name: string): PeerConfig | undefined {
		return this.peers.get(name);
	}

	getAllPeers(): PeerInfo[] {
		return Array.from(this.peers.entries()).map(([name, config]) => ({
			name,
			url: config.url,
			description: config.description ?? "",
			enabled: config.enabled ?? true,
		}));
	}

	getMcpServerConfigs(): Record<string, PeerMcpServerConfig> {
		const configs: Record<string, PeerMcpServerConfig> = {};

		for (const [name, config] of this.peers) {
			if (!config.enabled) continue;

			configs[name] = {
				type: "url",
				url: config.url,
				headers: {
					Authorization: `Bearer ${config.token}`,
				},
			};
		}

		return configs;
	}

	count(): number {
		return this.peers.size;
	}

	has(name: string): boolean {
		return this.peers.has(name);
	}
}

export type PeerHealthStatus = {
	name: string;
	url: string;
	healthy: boolean;
	latencyMs: number;
	error?: string;
	agentName?: string;
	version?: string;
};

export async function checkPeerHealth(name: string, config: PeerConfig, timeoutMs = 5000): Promise<PeerHealthStatus> {
	const healthUrl = new URL(config.url);
	// The MCP endpoint is at /mcp. Health is at /health on the same host.
	healthUrl.pathname = "/health";

	const startTime = Date.now();

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);

		const response = await fetch(healthUrl.toString(), {
			signal: controller.signal,
			headers: { Authorization: `Bearer ${config.token}` },
		});

		clearTimeout(timeout);

		const latencyMs = Date.now() - startTime;

		if (!response.ok) {
			return { name, url: config.url, healthy: false, latencyMs, error: `HTTP ${response.status}` };
		}

		const body = (await response.json()) as Record<string, unknown>;

		return {
			name,
			url: config.url,
			healthy: body.status === "ok" || body.status === "degraded",
			latencyMs,
			agentName: body.agent as string | undefined,
			version: body.version as string | undefined,
		};
	} catch (err: unknown) {
		const latencyMs = Date.now() - startTime;
		const msg = err instanceof Error ? err.message : String(err);
		return { name, url: config.url, healthy: false, latencyMs, error: msg };
	}
}

export async function checkAllPeerHealth(manager: PeerManager): Promise<PeerHealthStatus[]> {
	const peers = manager.getAllPeers();
	const checks = peers.map(async (peer) => {
		const config = manager.getPeer(peer.name);
		if (!config) return { name: peer.name, url: peer.url, healthy: false, latencyMs: 0, error: "Config not found" };
		return checkPeerHealth(peer.name, config);
	});

	return Promise.all(checks);
}

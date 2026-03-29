import { type PeerHealthStatus, type PeerManager, checkAllPeerHealth } from "./peers.ts";

export type PeerHealthMonitorConfig = {
	intervalMs: number;
	timeoutMs: number;
};

const DEFAULT_CONFIG: PeerHealthMonitorConfig = {
	intervalMs: 60_000,
	timeoutMs: 5_000,
};

export class PeerHealthMonitor {
	private peerManager: PeerManager;
	private config: PeerHealthMonitorConfig;
	private interval: ReturnType<typeof setInterval> | null = null;
	private lastResults: PeerHealthStatus[] = [];

	constructor(peerManager: PeerManager, config?: Partial<PeerHealthMonitorConfig>) {
		this.peerManager = peerManager;
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	start(): void {
		if (this.interval) return;

		// Run immediately on start
		this.runCheck().catch((err: unknown) => {
			const msg = err instanceof Error ? err.message : String(err);
			console.warn(`[peer-health] Initial health check failed: ${msg}`);
		});

		this.interval = setInterval(() => {
			this.runCheck().catch((err: unknown) => {
				const msg = err instanceof Error ? err.message : String(err);
				console.warn(`[peer-health] Health check failed: ${msg}`);
			});
		}, this.config.intervalMs);
	}

	stop(): void {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}
	}

	private async runCheck(): Promise<void> {
		if (this.peerManager.count() === 0) return;

		this.lastResults = await checkAllPeerHealth(this.peerManager);

		const healthy = this.lastResults.filter((r) => r.healthy).length;
		const unhealthy = this.lastResults.filter((r) => !r.healthy).length;

		if (unhealthy > 0) {
			const failedNames = this.lastResults
				.filter((r) => !r.healthy)
				.map((r) => `${r.name} (${r.error ?? "unknown"})`)
				.join(", ");
			console.warn(`[peer-health] ${healthy}/${this.lastResults.length} peers healthy. Unhealthy: ${failedNames}`);
		}
	}

	getLastResults(): PeerHealthStatus[] {
		return this.lastResults;
	}

	getHealthSummary(): Record<string, { healthy: boolean; latencyMs: number; error?: string }> {
		const summary: Record<string, { healthy: boolean; latencyMs: number; error?: string }> = {};

		for (const result of this.lastResults) {
			summary[result.name] = {
				healthy: result.healthy,
				latencyMs: result.latencyMs,
				...(result.error ? { error: result.error } : {}),
			};
		}

		return summary;
	}

	isRunning(): boolean {
		return this.interval !== null;
	}
}

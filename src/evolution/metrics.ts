import { readFileSync, writeFileSync } from "node:fs";
import type { EvolutionConfig } from "./config.ts";
import type { EvolutionMetrics, MetricsSnapshot } from "./types.ts";

/**
 * Read metrics from phantom-config/meta/metrics.json.
 */
export function readMetrics(config: EvolutionConfig): EvolutionMetrics {
	try {
		const text = readFileSync(config.paths.metrics_file, "utf-8");
		return JSON.parse(text) as EvolutionMetrics;
	} catch {
		return defaultMetrics();
	}
}

/**
 * Write metrics to phantom-config/meta/metrics.json.
 */
export function writeMetrics(config: EvolutionConfig, metrics: EvolutionMetrics): void {
	writeFileSync(config.paths.metrics_file, `${JSON.stringify(metrics, null, 2)}\n`, "utf-8");
}

/**
 * Update metrics after a session completes.
 */
export function updateAfterSession(
	config: EvolutionConfig,
	outcome: "success" | "failure" | "partial" | "abandoned",
	hadCorrections: boolean,
): EvolutionMetrics {
	const metrics = readMetrics(config);

	metrics.session_count++;

	if (outcome === "success") {
		metrics.success_count++;
	} else if (outcome === "failure") {
		metrics.failure_count++;
	}

	if (hadCorrections) {
		metrics.correction_count++;
	}

	metrics.last_session_at = new Date().toISOString();
	metrics.sessions_since_consolidation++;

	// Recalculate rolling rates
	metrics.success_rate_7d = calculateRollingRate(metrics.success_count, metrics.session_count);
	metrics.correction_rate_7d = calculateRollingRate(metrics.correction_count, metrics.session_count);

	writeMetrics(config, metrics);
	return metrics;
}

/**
 * Update metrics after an evolution step.
 */
export function updateAfterEvolution(config: EvolutionConfig): EvolutionMetrics {
	const metrics = readMetrics(config);
	metrics.evolution_count++;
	metrics.last_evolution_at = new Date().toISOString();
	writeMetrics(config, metrics);
	return metrics;
}

/**
 * Update metrics after a rollback.
 */
export function updateAfterRollback(config: EvolutionConfig): EvolutionMetrics {
	const metrics = readMetrics(config);
	metrics.rollback_count++;
	writeMetrics(config, metrics);
	return metrics;
}

/**
 * Reset the consolidation counter.
 */
export function resetConsolidationCounter(config: EvolutionConfig): void {
	const metrics = readMetrics(config);
	metrics.sessions_since_consolidation = 0;
	writeMetrics(config, metrics);
}

/**
 * Check if auto-rollback should be triggered based on recent metrics.
 * Returns true if success rate has dropped by more than the threshold
 * within the evaluation window.
 */
export function checkForAutoRollback(config: EvolutionConfig): {
	shouldRollback: boolean;
	reason: string;
} {
	const metrics = readMetrics(config);

	if (metrics.session_count < config.gates.auto_rollback_window) {
		return { shouldRollback: false, reason: "Not enough sessions for evaluation." };
	}

	// Check if success rate has dropped significantly
	const expectedRate = metrics.success_count > 0 ? (metrics.success_count - 1) / (metrics.session_count - 1) : 0;

	const currentRate = metrics.success_rate_7d;
	const drop = expectedRate - currentRate;

	if (drop > config.gates.auto_rollback_threshold) {
		return {
			shouldRollback: true,
			reason: `Success rate dropped by ${(drop * 100).toFixed(1)}% (threshold: ${(config.gates.auto_rollback_threshold * 100).toFixed(1)}%).`,
		};
	}

	return { shouldRollback: false, reason: "Metrics within acceptable range." };
}

/**
 * Get a snapshot of current metrics for version tagging.
 */
export function getMetricsSnapshot(config: EvolutionConfig): MetricsSnapshot {
	const metrics = readMetrics(config);
	return {
		session_count: metrics.session_count,
		success_rate_7d: metrics.success_rate_7d,
		correction_rate_7d: metrics.correction_rate_7d,
	};
}

function defaultMetrics(): EvolutionMetrics {
	return {
		session_count: 0,
		success_count: 0,
		failure_count: 0,
		correction_count: 0,
		evolution_count: 0,
		rollback_count: 0,
		last_session_at: null,
		last_evolution_at: null,
		success_rate_7d: 0,
		correction_rate_7d: 0,
		sessions_since_consolidation: 0,
	};
}

function calculateRollingRate(count: number, total: number): number {
	if (total === 0) return 0;
	return Math.round((count / total) * 100) / 100;
}

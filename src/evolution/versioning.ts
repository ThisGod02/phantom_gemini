import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { EvolutionConfig } from "./config.ts";
import type { EvolutionVersion, MetricsSnapshot, VersionChange } from "./types.ts";

/**
 * Read the current version from phantom-config/meta/version.json.
 */
export function readVersion(config: EvolutionConfig): EvolutionVersion {
	const path = config.paths.version_file;

	try {
		const text = readFileSync(path, "utf-8");
		return JSON.parse(text) as EvolutionVersion;
	} catch {
		return {
			version: 0,
			parent: null,
			timestamp: new Date().toISOString(),
			changes: [],
			metrics_at_change: { session_count: 0, success_rate_7d: 0, correction_rate_7d: 0 },
		};
	}
}

/**
 * Write a new version to phantom-config/meta/version.json.
 */
export function writeVersion(config: EvolutionConfig, version: EvolutionVersion): void {
	const path = config.paths.version_file;
	writeFileSync(path, `${JSON.stringify(version, null, 2)}\n`, "utf-8");
}

/**
 * Create the next version from the current one.
 */
export function createNextVersion(
	current: EvolutionVersion,
	changes: VersionChange[],
	metricsSnapshot: MetricsSnapshot,
): EvolutionVersion {
	return {
		version: current.version + 1,
		parent: current.version,
		timestamp: new Date().toISOString(),
		changes,
		metrics_at_change: metricsSnapshot,
	};
}

/**
 * Get version history by walking the parent chain.
 * Reads the version-history.jsonl file if available, otherwise returns current only.
 */
export function getHistory(config: EvolutionConfig, limit = 50): EvolutionVersion[] {
	const historyPath = config.paths.evolution_log;
	const history: EvolutionVersion[] = [];

	try {
		const text = readFileSync(historyPath, "utf-8").trim();
		if (!text) return [readVersion(config)];

		const lines = text.split("\n").filter(Boolean);
		for (const line of lines.slice(-limit)) {
			try {
				const entry = JSON.parse(line) as { version?: EvolutionVersion };
				if (entry.version) {
					history.push(entry.version as unknown as EvolutionVersion);
				}
			} catch {
				// Skip malformed lines
			}
		}
	} catch {
		// No history file, return current version only
	}

	if (history.length === 0) {
		history.push(readVersion(config));
	}

	return history;
}

/**
 * Rollback to a specific version number.
 * Restores file contents by reversing the change chain from current back to target.
 */
export function rollback(config: EvolutionConfig, toVersion: number): EvolutionVersion {
	const current = readVersion(config);

	if (toVersion >= current.version) {
		throw new Error(`Cannot rollback to version ${toVersion}: current version is ${current.version}.`);
	}

	if (toVersion < 0) {
		throw new Error(`Cannot rollback to version ${toVersion}: version must be non-negative.`);
	}

	// Read the evolution log to find all versions between current and target
	const logPath = config.paths.evolution_log;
	const allEntries: Array<{ version: number; changes: VersionChange[] }> = [];

	try {
		const text = readFileSync(logPath, "utf-8").trim();
		if (text) {
			for (const line of text.split("\n").filter(Boolean)) {
				try {
					const entry = JSON.parse(line) as { version: number; details: VersionChange[] };
					allEntries.push({ version: entry.version, changes: entry.details || [] });
				} catch {
					// Skip malformed
				}
			}
		}
	} catch {
		// No log available
	}

	// Reverse changes from current version back to target+1
	const changesToReverse = allEntries
		.filter((e) => e.version > toVersion && e.version <= current.version)
		.sort((a, b) => b.version - a.version);

	for (const entry of changesToReverse) {
		for (const change of entry.changes) {
			reverseChange(config, change);
		}
	}

	// Write the rolled-back version
	const rolledBack: EvolutionVersion = {
		version: toVersion,
		parent: current.version,
		timestamp: new Date().toISOString(),
		changes: [],
		metrics_at_change: current.metrics_at_change,
	};

	writeVersion(config, rolledBack);
	return rolledBack;
}

/**
 * Reverse a single change. For appends, remove the appended content.
 * For replacements, swap content and target.
 */
function reverseChange(config: EvolutionConfig, change: VersionChange): void {
	const filePath = `${config.paths.config_dir}/${change.file}`;

	if (!existsSync(filePath)) return;

	let content = readFileSync(filePath, "utf-8");

	switch (change.type) {
		case "append": {
			// Remove the appended content
			const idx = content.lastIndexOf(change.content);
			if (idx !== -1) {
				// Also remove the preceding newline if present
				const start = idx > 0 && content[idx - 1] === "\n" ? idx - 1 : idx;
				content = content.slice(0, start) + content.slice(idx + change.content.length);
			}
			break;
		}
		case "replace":
		case "remove":
			// Cannot precisely reverse without storing the original content
			// For now, these are best-effort
			break;
	}

	writeFileSync(filePath, content, "utf-8");
}

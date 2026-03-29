import type { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * True when phantom-config/meta/version.json shows generation 0.
 * This means the agent has never completed onboarding.
 */
export function isFirstRun(configDir: string): boolean {
	try {
		const raw = readFileSync(join(configDir, "meta/version.json"), "utf-8");
		const version = JSON.parse(raw) as { version: number };
		return version.version === 0;
	} catch {
		// No version file at all means first run
		return true;
	}
}

/**
 * True when onboarding was started but not completed (survives restarts).
 */
export function isOnboardingInProgress(db: Database): boolean {
	const row = db.query("SELECT status FROM onboarding_state ORDER BY id DESC LIMIT 1").get() as {
		status: string;
	} | null;
	return row?.status === "in_progress";
}

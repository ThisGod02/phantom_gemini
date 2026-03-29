import type { Database } from "bun:sqlite";

export type OnboardingStatus = "pending" | "in_progress" | "complete";

export type OnboardingRecord = {
	status: OnboardingStatus;
	started_at: string | null;
	completed_at: string | null;
};

export function getOnboardingStatus(db: Database): OnboardingRecord {
	const row = db
		.query("SELECT status, started_at, completed_at FROM onboarding_state ORDER BY id DESC LIMIT 1")
		.get() as OnboardingRecord | null;

	return row ?? { status: "pending", started_at: null, completed_at: null };
}

export function markOnboardingStarted(db: Database): void {
	const existing = getOnboardingStatus(db);
	if (existing.status === "in_progress") return;

	db.run("INSERT INTO onboarding_state (status, started_at) VALUES (?, datetime('now'))", ["in_progress"]);
}

export function markOnboardingComplete(db: Database): void {
	db.run(
		`UPDATE onboarding_state SET status = 'complete', completed_at = datetime('now')
		 WHERE status = 'in_progress'`,
	);
}

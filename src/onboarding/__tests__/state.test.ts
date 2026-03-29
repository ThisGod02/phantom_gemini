import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runMigrations } from "../../db/migrate.ts";
import { getOnboardingStatus, markOnboardingComplete, markOnboardingStarted } from "../state.ts";

describe("onboarding state", () => {
	let db: Database;

	beforeEach(() => {
		db = new Database(":memory:");
		db.run("PRAGMA journal_mode = WAL");
		db.run("PRAGMA foreign_keys = ON");
		runMigrations(db);
	});

	afterEach(() => {
		db.close();
	});

	test("getOnboardingStatus returns pending when no records exist", () => {
		const status = getOnboardingStatus(db);
		expect(status.status).toBe("pending");
		expect(status.started_at).toBeNull();
		expect(status.completed_at).toBeNull();
	});

	test("markOnboardingStarted creates in_progress record", () => {
		markOnboardingStarted(db);
		const status = getOnboardingStatus(db);
		expect(status.status).toBe("in_progress");
		expect(status.started_at).not.toBeNull();
		expect(status.completed_at).toBeNull();
	});

	test("markOnboardingStarted is idempotent", () => {
		markOnboardingStarted(db);
		markOnboardingStarted(db);

		const rows = db.query("SELECT * FROM onboarding_state").all();
		expect(rows).toHaveLength(1);
	});

	test("markOnboardingComplete transitions in_progress to complete", () => {
		markOnboardingStarted(db);
		markOnboardingComplete(db);
		const status = getOnboardingStatus(db);
		expect(status.status).toBe("complete");
		expect(status.completed_at).not.toBeNull();
	});

	test("markOnboardingComplete does nothing when not in_progress", () => {
		markOnboardingComplete(db);
		const status = getOnboardingStatus(db);
		expect(status.status).toBe("pending");
	});

	test("full lifecycle: pending -> in_progress -> complete", () => {
		expect(getOnboardingStatus(db).status).toBe("pending");

		markOnboardingStarted(db);
		expect(getOnboardingStatus(db).status).toBe("in_progress");

		markOnboardingComplete(db);
		expect(getOnboardingStatus(db).status).toBe("complete");
	});
});

import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runMigrations } from "../../db/migrate.ts";
import { isFirstRun, isOnboardingInProgress } from "../detection.ts";

describe("isFirstRun", () => {
	const tmpDir = join(import.meta.dir, ".tmp-detection");

	beforeEach(() => {
		mkdirSync(join(tmpDir, "meta"), { recursive: true });
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	test("returns true when version is 0", () => {
		writeFileSync(
			join(tmpDir, "meta/version.json"),
			JSON.stringify({ version: 0, parent: null, timestamp: "2026-01-01T00:00:00Z", changes: [] }),
		);
		expect(isFirstRun(tmpDir)).toBe(true);
	});

	test("returns false when version is greater than 0", () => {
		writeFileSync(
			join(tmpDir, "meta/version.json"),
			JSON.stringify({ version: 1, parent: 0, timestamp: "2026-01-01T00:00:00Z", changes: [] }),
		);
		expect(isFirstRun(tmpDir)).toBe(false);
	});

	test("returns true when version.json does not exist", () => {
		rmSync(join(tmpDir, "meta/version.json"), { force: true });
		expect(isFirstRun(tmpDir)).toBe(true);
	});

	test("returns true when version.json is malformed", () => {
		writeFileSync(join(tmpDir, "meta/version.json"), "not json");
		expect(isFirstRun(tmpDir)).toBe(true);
	});

	test("returns false for version 5", () => {
		writeFileSync(
			join(tmpDir, "meta/version.json"),
			JSON.stringify({ version: 5, parent: 4, timestamp: "2026-01-01T00:00:00Z", changes: [] }),
		);
		expect(isFirstRun(tmpDir)).toBe(false);
	});
});

describe("isOnboardingInProgress", () => {
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

	test("returns false when no onboarding records exist", () => {
		expect(isOnboardingInProgress(db)).toBe(false);
	});

	test("returns true when status is in_progress", () => {
		db.run("INSERT INTO onboarding_state (status, started_at) VALUES ('in_progress', datetime('now'))");
		expect(isOnboardingInProgress(db)).toBe(true);
	});

	test("returns false when status is complete", () => {
		db.run(
			"INSERT INTO onboarding_state (status, started_at, completed_at) VALUES ('complete', datetime('now'), datetime('now'))",
		);
		expect(isOnboardingInProgress(db)).toBe(false);
	});

	test("returns false when status is pending", () => {
		db.run("INSERT INTO onboarding_state (status) VALUES ('pending')");
		expect(isOnboardingInProgress(db)).toBe(false);
	});
});

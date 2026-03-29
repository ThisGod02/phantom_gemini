import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { runMigrations } from "../../db/migrate.ts";
import { CostTracker } from "../cost-tracker.ts";
import type { AgentCost } from "../events.ts";
import { SessionStore } from "../session-store.ts";

let db: Database;
let store: SessionStore;
let tracker: CostTracker;

beforeEach(() => {
	db = new Database(":memory:");
	db.run("PRAGMA journal_mode = WAL");
	db.run("PRAGMA foreign_keys = ON");
	runMigrations(db);
	store = new SessionStore(db);
	tracker = new CostTracker(db);
});

function makeCost(usd: number, input: number, output: number): AgentCost {
	return {
		totalUsd: usd,
		inputTokens: input,
		outputTokens: output,
		modelUsage: {
			"claude-opus-4-6": { inputTokens: input, outputTokens: output, costUsd: usd },
		},
	};
}

describe("CostTracker", () => {
	test("records a cost event and updates session totals", () => {
		store.create("cli", "conv-1");
		const cost = makeCost(0.05, 1000, 500);

		tracker.record("cli:conv-1", cost, "claude-opus-4-6");

		const session = store.getByKey("cli:conv-1");
		expect(session?.total_cost_usd).toBeCloseTo(0.05);
		expect(session?.input_tokens).toBe(1000);
		expect(session?.output_tokens).toBe(500);
		expect(session?.turn_count).toBe(1);
	});

	test("accumulates costs across multiple recordings", () => {
		store.create("cli", "conv-1");
		tracker.record("cli:conv-1", makeCost(0.03, 800, 400), "claude-opus-4-6");
		tracker.record("cli:conv-1", makeCost(0.07, 1200, 600), "claude-opus-4-6");

		const session = store.getByKey("cli:conv-1");
		expect(session?.total_cost_usd).toBeCloseTo(0.1);
		expect(session?.input_tokens).toBe(2000);
		expect(session?.output_tokens).toBe(1000);
		expect(session?.turn_count).toBe(2);
	});

	test("getSessionCost returns the total cost", () => {
		store.create("cli", "conv-1");
		tracker.record("cli:conv-1", makeCost(0.12, 2000, 1000), "claude-opus-4-6");

		const cost = tracker.getSessionCost("cli:conv-1");
		expect(cost).toBeCloseTo(0.12);
	});

	test("getSessionCost returns 0 for unknown session", () => {
		const cost = tracker.getSessionCost("unknown:session");
		expect(cost).toBe(0);
	});

	test("getCostEvents returns individual events", () => {
		store.create("cli", "conv-1");
		tracker.record("cli:conv-1", makeCost(0.03, 500, 200), "claude-opus-4-6");
		tracker.record("cli:conv-1", makeCost(0.05, 800, 300), "claude-opus-4-6");

		const events = tracker.getCostEvents("cli:conv-1");
		expect(events.length).toBe(2);
		expect(events[0].model).toBe("claude-opus-4-6");
	});
});

import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AuditLogger } from "../audit.ts";

describe("AuditLogger", () => {
	let db: Database;
	let audit: AuditLogger;

	beforeAll(() => {
		db = new Database(":memory:");
		audit = new AuditLogger(db);
	});

	afterAll(() => {
		db.close();
	});

	test("logs an entry", () => {
		audit.log({
			client_name: "test-client",
			method: "tools/call",
			tool_name: "phantom_status",
			resource_uri: null,
			input_summary: "{}",
			output_summary: '{"state":"idle"}',
			cost_usd: 0,
			duration_ms: 42,
			status: "success",
		});

		const entries = audit.getRecent(10);
		expect(entries.length).toBe(1);
		expect(entries[0].client_name).toBe("test-client");
		expect(entries[0].method).toBe("tools/call");
		expect(entries[0].tool_name).toBe("phantom_status");
		expect(entries[0].status).toBe("success");
	});

	test("logs multiple entries and returns in desc order", () => {
		audit.log({
			client_name: "client-a",
			method: "tools/call",
			tool_name: "phantom_ask",
			resource_uri: null,
			input_summary: "hello",
			output_summary: "response",
			cost_usd: 0.01,
			duration_ms: 1000,
			status: "success",
		});

		audit.log({
			client_name: "client-b",
			method: "resources/read",
			tool_name: null,
			resource_uri: "phantom://health",
			input_summary: null,
			output_summary: "health data",
			cost_usd: 0,
			duration_ms: 5,
			status: "success",
		});

		const entries = audit.getRecent(10);
		// Should have 3 total (1 from first test + 2 from this)
		expect(entries.length).toBe(3);
		// Most recent first
		expect(entries[0].client_name).toBe("client-b");
	});

	test("getByClient filters correctly", () => {
		const clientBEntries = audit.getByClient("client-b");
		expect(clientBEntries.length).toBe(1);
		expect(clientBEntries[0].resource_uri).toBe("phantom://health");
	});

	test("logs error entries", () => {
		audit.log({
			client_name: "bad-client",
			method: "tools/call",
			tool_name: "phantom_ask",
			resource_uri: null,
			input_summary: "test",
			output_summary: "rate limited",
			cost_usd: 0,
			duration_ms: 1,
			status: "error",
		});

		const entries = audit.getByClient("bad-client");
		expect(entries.length).toBe(1);
		expect(entries[0].status).toBe("error");
	});

	test("truncates long input summaries", () => {
		const longInput = "x".repeat(1000);
		audit.log({
			client_name: "truncate-test",
			method: "tools/call",
			tool_name: "phantom_ask",
			resource_uri: null,
			input_summary: longInput,
			output_summary: null,
			cost_usd: 0,
			duration_ms: 1,
			status: "success",
		});

		const entries = audit.getByClient("truncate-test");
		expect(entries[0].input_summary?.length).toBeLessThanOrEqual(500);
	});
});

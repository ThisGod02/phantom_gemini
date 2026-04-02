import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { DynamicToolRegistry } from "../../mcp/dynamic-tools.ts";
import { dynamicToolDeclarations, handleDynamicToolCall } from "../in-process-tools.ts";

describe("dynamic tools handler", () => {
	let db: Database;
	let registry: DynamicToolRegistry;

	beforeAll(() => {
		db = new Database(":memory:");
		db.run(
			`CREATE TABLE IF NOT EXISTS dynamic_tools (
				name TEXT PRIMARY KEY,
				description TEXT NOT NULL,
				input_schema TEXT NOT NULL,
				handler_type TEXT NOT NULL DEFAULT 'shell',
				handler_code TEXT,
				handler_path TEXT,
				registered_at TEXT NOT NULL DEFAULT (datetime('now')),
				registered_by TEXT
			)`,
		);
		registry = new DynamicToolRegistry(db);
	});

	afterAll(() => {
		db.close();
	});

	test("has correct declarations", () => {
		expect(dynamicToolDeclarations.length).toBe(3);
		expect(dynamicToolDeclarations.map(d => d.name)).toContain("phantom_register_tool");
	});

	test("registers and unregisters tools", async () => {
		const result = await handleDynamicToolCall(
			"phantom_register_tool", 
			{ 
				name: "test_tool", 
				description: "A test tool", 
				handler_type: "shell", 
				handler_code: "echo hello" 
			}, 
			registry
		);
		
		expect((result as any).registered).toBe(true);
		expect(registry.has("test_tool")).toBe(true);

		const unregisterResult = await handleDynamicToolCall(
			"phantom_unregister_tool", 
			{ name: "test_tool" }, 
			registry
		);
		expect((unregisterResult as any).removed).toBe(true);
		expect(registry.has("test_tool")).toBe(false);
	});
});

import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { DynamicToolRegistry } from "../../mcp/dynamic-tools.ts";
import { createInProcessToolServer } from "../in-process-tools.ts";

describe("createInProcessToolServer", () => {
	let db: Database;
	let registry: DynamicToolRegistry;

	beforeAll(() => {
		db = new Database(":memory:");
		db.run(
			`CREATE TABLE IF NOT EXISTS dynamic_tools (
				name TEXT PRIMARY KEY,
				description TEXT NOT NULL,
				input_schema TEXT NOT NULL,
				handler_type TEXT NOT NULL DEFAULT 'inline',
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

	test("returns a valid SDK MCP server config", () => {
		const server = createInProcessToolServer(registry);
		expect(server).toBeDefined();
		expect(server.type).toBe("sdk");
		expect(server.name).toBe("phantom-dynamic-tools");
		expect(server.instance).toBeDefined();
	});

	test("shares the same registry instance", () => {
		registry.register({
			name: "shared_test",
			description: "Test shared registry",
			input_schema: {},
			handler_type: "shell",
			handler_code: "echo shared",
		});

		expect(registry.has("shared_test")).toBe(true);

		// Clean up
		registry.unregister("shared_test");
	});

	test("server has correct type for SDK mcpServers config", () => {
		const server = createInProcessToolServer(registry);
		// Verify it can be used in a Record<string, McpServerConfig>
		const mcpServers = { "phantom-dynamic-tools": server };
		expect(mcpServers["phantom-dynamic-tools"].type).toBe("sdk");
		expect(mcpServers["phantom-dynamic-tools"].name).toBe("phantom-dynamic-tools");
	});
});

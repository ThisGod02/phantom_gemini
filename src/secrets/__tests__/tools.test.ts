import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createTestDatabase } from "../../db/connection.ts";
import { MIGRATIONS } from "../../db/schema.ts";
import { resetKeyCache } from "../crypto.ts";
import { createSecretToolServer } from "../tools.ts";

function setup() {
	resetKeyCache();
	process.env.SECRET_ENCRYPTION_KEY = randomBytes(32).toString("hex");
	const db = createTestDatabase();
	for (const migration of MIGRATIONS) {
		db.run(migration);
	}
	return { db };
}

describe("createSecretToolServer", () => {
	test("returns a valid SDK MCP server config", () => {
		const { db } = setup();
		const server = createSecretToolServer({ db, baseUrl: "https://test.ghostwright.dev" });
		expect(server).toBeDefined();
		expect(server.type).toBe("sdk");
		expect(server.name).toBe("phantom-secrets");
		expect(server.instance).toBeDefined();
	});

	test("server has correct name", () => {
		const { db } = setup();
		const server = createSecretToolServer({ db, baseUrl: "https://test.ghostwright.dev" });
		expect(server.name).toBe("phantom-secrets");
	});

	test("factory produces independent instances", () => {
		const { db } = setup();
		const server1 = createSecretToolServer({ db, baseUrl: "https://test.ghostwright.dev" });
		const server2 = createSecretToolServer({ db, baseUrl: "https://test.ghostwright.dev" });
		expect(server1).not.toBe(server2);
		expect(server1.name).toBe(server2.name);
	});

	test("server config can be used in mcpServers record", () => {
		const { db } = setup();
		const server = createSecretToolServer({ db, baseUrl: "https://test.ghostwright.dev" });
		const mcpServers = { "phantom-secrets": server };
		expect(mcpServers["phantom-secrets"].type).toBe("sdk");
		expect(mcpServers["phantom-secrets"].name).toBe("phantom-secrets");
	});
});

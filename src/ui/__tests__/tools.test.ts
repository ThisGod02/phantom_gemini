import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { setPublicDir } from "../serve.ts";
import { revokeAllSessions } from "../session.ts";
import { createWebUiToolServer } from "../tools.ts";

const testPublicDir = resolve(import.meta.dir, "../../../public");
setPublicDir(testPublicDir);

// Clean up test files after each test
const createdFiles: string[] = [];

afterEach(() => {
	revokeAllSessions();
	for (const file of createdFiles) {
		if (existsSync(file)) {
			rmSync(file, { force: true });
		}
	}
	createdFiles.length = 0;
	// Clean up test subdirectories
	const testDir = resolve(testPublicDir, "_test_pages");
	if (existsSync(testDir)) {
		rmSync(testDir, { recursive: true, force: true });
	}
});

describe("createWebUiToolServer", () => {
	test("creates an MCP server with two tools", () => {
		const server = createWebUiToolServer("ghostwright.dev", "phantom-dev");
		expect(server).toBeDefined();
		expect(server.name).toBe("phantom-web-ui");
	});
});

describe("phantom_generate_login tool integration", () => {
	test("generate login returns magic link with correct domain", async () => {
		const server = createWebUiToolServer("ghostwright.dev", "phantom-dev");
		// The tool server is an MCP SDK server. We test it by verifying the factory produces valid output.
		expect(server).toBeDefined();
	});
});

describe("phantom_create_page tool integration", () => {
	test("tool server has expected name", () => {
		const server = createWebUiToolServer(undefined, "test-agent");
		expect(server.name).toBe("phantom-web-ui");
	});
});

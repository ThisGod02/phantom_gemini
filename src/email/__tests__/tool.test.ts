import { describe, expect, test } from "bun:test";
import { createEmailToolServer } from "../tool.ts";

const defaultDeps = {
	agentName: "phantom-dev",
	domain: "ghostwright.dev",
	dailyLimit: 50,
};

describe("createEmailToolServer", () => {
	test("returns a valid SDK MCP server config", () => {
		const server = createEmailToolServer(defaultDeps);
		expect(server).toBeDefined();
		expect(server.type).toBe("sdk");
		expect(server.name).toBe("phantom-email");
		expect(server.instance).toBeDefined();
	});

	test("server has correct name", () => {
		const server = createEmailToolServer(defaultDeps);
		expect(server.name).toBe("phantom-email");
	});

	test("server config can be used in mcpServers record", () => {
		const server = createEmailToolServer(defaultDeps);
		const mcpServers = { "phantom-email": server };
		expect(mcpServers["phantom-email"].type).toBe("sdk");
		expect(mcpServers["phantom-email"].name).toBe("phantom-email");
	});

	test("factory produces independent instances", () => {
		const server1 = createEmailToolServer(defaultDeps);
		const server2 = createEmailToolServer(defaultDeps);
		expect(server1).not.toBe(server2);
		expect(server1.name).toBe(server2.name);
	});

	test("uses custom domain when provided", () => {
		const server = createEmailToolServer({
			agentName: "cody",
			domain: "acme.com",
			dailyLimit: 100,
		});
		expect(server.name).toBe("phantom-email");
		expect(server.type).toBe("sdk");
	});
});

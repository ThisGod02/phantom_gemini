import { describe, expect, test } from "bun:test";
import { createEmailDeclarations } from "../tool.ts";

const defaultDeps = {
	agentName: "phantom-dev",
	domain: "ghostwright.dev",
	dailyLimit: 50,
};

describe("createEmailDeclarations", () => {
	test("returns valid FunctionDeclarations", () => {
		const declarations = createEmailDeclarations(defaultDeps);
		expect(declarations).toBeDefined();
		expect(Array.isArray(declarations)).toBe(true);
		expect(declarations.length).toBeGreaterThan(0);
	});

	test("declarations have correct name", () => {
		const declarations = createEmailDeclarations(defaultDeps);
		expect(declarations[0].name).toBe("phantom_send_email");
	});

	test("uses custom domain when provided in description", () => {
		const declarations = createEmailDeclarations({
			agentName: "cody",
			domain: "acme.com",
			dailyLimit: 100,
		});
		expect(declarations[0].description).toContain("cody@acme.com");
	});
});

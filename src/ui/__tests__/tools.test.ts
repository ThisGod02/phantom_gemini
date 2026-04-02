import { describe, expect, test } from "bun:test";
import { webUiDeclarations } from "../tools.ts";

describe("webUiDeclarations", () => {
	test("provides valid declarations", () => {
		expect(webUiDeclarations).toBeDefined();
		expect(Array.isArray(webUiDeclarations)).toBe(true);
		expect(webUiDeclarations.length).toBeGreaterThan(0);
		expect(webUiDeclarations.map(d => d.name)).toContain("phantom_create_page");
		expect(webUiDeclarations.map(d => d.name)).toContain("phantom_generate_login");
	});
});

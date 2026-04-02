import { describe, expect, test } from "bun:test";
import { secretsDeclarations } from "../tools.ts";

describe("secretsDeclarations", () => {
	test("provides valid declarations", () => {
		expect(secretsDeclarations).toBeDefined();
		expect(Array.isArray(secretsDeclarations)).toBe(true);
		expect(secretsDeclarations.length).toBeGreaterThan(0);
		expect(secretsDeclarations.map(d => d.name)).toContain("phantom_collect_secrets");
		expect(secretsDeclarations.map(d => d.name)).toContain("phantom_get_secret");
	});
});

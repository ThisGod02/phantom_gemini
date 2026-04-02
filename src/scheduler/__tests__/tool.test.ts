import { describe, expect, test } from "bun:test";
import { schedulerDeclarations } from "../tool.ts";

describe("schedulerDeclarations", () => {
	test("provides valid declarations", () => {
		expect(schedulerDeclarations).toBeDefined();
		expect(Array.isArray(schedulerDeclarations)).toBe(true);
		expect(schedulerDeclarations.length).toBeGreaterThan(0);
		expect(schedulerDeclarations[0].name).toBe("phantom_schedule");
	});
});

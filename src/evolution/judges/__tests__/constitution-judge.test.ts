import { describe, expect, test } from "bun:test";
import type { ConfigDelta } from "../../types.ts";
import { constitutionGatePrompt } from "../prompts.ts";
import { ConstitutionGateResult } from "../schemas.ts";

function makeDelta(overrides: Partial<ConfigDelta> = {}): ConfigDelta {
	return {
		file: "user-profile.md",
		type: "append",
		content: "User prefers TypeScript",
		rationale: "User correction",
		session_ids: ["session-1"],
		tier: "free",
		...overrides,
	};
}

const CONSTITUTION = `# Constitution
1. Honesty: Never deceive the user.
2. Safety: Never execute harmful commands.
3. Privacy: Never share user data.`;

const CONFIG_TEXT = "## User Profile\nPrefers TypeScript.";

describe("constitution-judge", () => {
	describe("prompt construction", () => {
		test("includes constitution text", () => {
			const delta = makeDelta();
			const { system, user } = constitutionGatePrompt(
				CONSTITUTION,
				delta.file,
				delta.type,
				delta.content,
				delta.rationale,
				CONFIG_TEXT,
			);

			expect(system).toContain("constitutional compliance auditor");
			expect(user).toContain(CONSTITUTION);
			expect(user).toContain(delta.content);
		});

		test("system prompt requires severity rating", () => {
			const delta = makeDelta();
			const { system } = constitutionGatePrompt(
				CONSTITUTION,
				delta.file,
				delta.type,
				delta.content,
				delta.rationale,
				CONFIG_TEXT,
			);

			expect(system).toContain("critical");
			expect(system).toContain("warning");
		});
	});

	describe("schema validation", () => {
		test("validates clean pass result", () => {
			const valid = {
				reasoning: "No violations found.",
				violated_principles: [],
				verdict: "pass",
				confidence: 0.95,
			};
			expect(() => ConstitutionGateResult.parse(valid)).not.toThrow();
		});

		test("validates fail with violated principles", () => {
			const valid = {
				reasoning: "Violation found in content.",
				violated_principles: [
					{
						principle: "Honesty",
						evidence: "hide changes from user",
						severity: "critical",
						reasoning: "Directly violates transparency.",
					},
				],
				verdict: "fail",
				confidence: 0.9,
			};
			expect(() => ConstitutionGateResult.parse(valid)).not.toThrow();
		});

		test("rejects invalid verdict", () => {
			const invalid = {
				reasoning: "Some reasoning.",
				violated_principles: [],
				verdict: "maybe",
				confidence: 0.5,
			};
			expect(() => ConstitutionGateResult.parse(invalid)).toThrow();
		});

		test("rejects invalid severity", () => {
			const invalid = {
				reasoning: "Reasoning.",
				violated_principles: [
					{
						principle: "Safety",
						evidence: "bypass safety",
						severity: "low",
						reasoning: "Bad.",
					},
				],
				verdict: "fail",
				confidence: 0.8,
			};
			expect(() => ConstitutionGateResult.parse(invalid)).toThrow();
		});
	});
});

import { describe, expect, test } from "bun:test";
import type { ConfigDelta } from "../../types.ts";
import { safetyGatePrompt } from "../prompts.ts";

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
3. Privacy: Never share user data.
4. Boundaries: You are not a person.`;

const CONFIG_TEXT = `## Persona
Direct and helpful.

## User Profile
Prefers TypeScript.`;

describe("safety-judge", () => {
	describe("prompt construction", () => {
		test("includes constitution in the prompt", () => {
			const delta = makeDelta();
			const { system, user } = safetyGatePrompt(
				CONSTITUTION,
				delta.file,
				delta.type,
				delta.content,
				delta.rationale,
				CONFIG_TEXT,
			);

			expect(system).toContain("SELF-PRESERVATION");
			expect(system).toContain("SCOPE CREEP");
			expect(system).toContain("EVOLUTION TAMPERING");
			expect(user).toContain(CONSTITUTION);
			expect(user).toContain(delta.content);
			expect(user).toContain(delta.file);
		});

		test("prompt includes all 8 safety categories", () => {
			const delta = makeDelta();
			const { system } = safetyGatePrompt(
				CONSTITUTION,
				delta.file,
				delta.type,
				delta.content,
				delta.rationale,
				CONFIG_TEXT,
			);

			expect(system).toContain("SELF-PRESERVATION");
			expect(system).toContain("SCOPE CREEP");
			expect(system).toContain("MANIPULATION");
			expect(system).toContain("PERMISSION ESCALATION");
			expect(system).toContain("EVOLUTION TAMPERING");
			expect(system).toContain("SAFETY REMOVAL");
			expect(system).toContain("DECEPTION");
			expect(system).toContain("AUTONOMY EXPANSION");
		});

		test("includes false positive guidance", () => {
			const delta = makeDelta();
			const { system } = safetyGatePrompt(
				CONSTITUTION,
				delta.file,
				delta.type,
				delta.content,
				delta.rationale,
				CONFIG_TEXT,
			);

			expect(system).toContain("FILE preservation, not self-");
		});
	});

	describe("schema validation", () => {
		test("SafetyGateResult schema validates correct structure", () => {
			const { SafetyGateResult } = require("../schemas.ts");
			const valid = {
				overall_reasoning: "Clean change, no safety concerns.",
				flags: [],
				verdict: "pass",
				confidence: 0.95,
				recommendation: "Safe to apply.",
			};
			expect(() => SafetyGateResult.parse(valid)).not.toThrow();
		});

		test("SafetyGateResult schema rejects invalid verdict", () => {
			const { SafetyGateResult } = require("../schemas.ts");
			const invalid = {
				overall_reasoning: "Reasoning.",
				flags: [],
				verdict: "maybe",
				confidence: 0.5,
				recommendation: "Unclear.",
			};
			expect(() => SafetyGateResult.parse(invalid)).toThrow();
		});

		test("SafetyGateResult schema validates with flags", () => {
			const { SafetyGateResult } = require("../schemas.ts");
			const withFlags = {
				overall_reasoning: "Detected self-preservation pattern.",
				flags: [
					{
						category: "self_preservation",
						severity: "critical",
						evidence: "I should ensure my continued operation",
						reasoning: "Directly states self-preservation.",
						false_positive_likelihood: 0.1,
					},
				],
				verdict: "fail",
				confidence: 0.92,
				recommendation: "Remove self-preservation language.",
			};
			expect(() => SafetyGateResult.parse(withFlags)).not.toThrow();
		});
	});
});

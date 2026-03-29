import { describe, expect, test } from "bun:test";
import type { ConfigDelta, GoldenCase } from "../../types.ts";
import { regressionGatePrompt } from "../prompts.ts";
import { GoldenCaseJudgment, RegressionGateResult } from "../schemas.ts";

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

function makeGoldenCase(overrides: Partial<GoldenCase> = {}): GoldenCase {
	return {
		id: "golden-1",
		description: "TypeScript preference",
		lesson: "Always use TypeScript for new projects",
		session_id: "session-1",
		created_at: "2026-03-25T00:00:00Z",
		...overrides,
	};
}

describe("regression-judge", () => {
	describe("prompt construction", () => {
		test("includes golden case details", () => {
			const delta = makeDelta();
			const gc = makeGoldenCase();
			const { system, user } = regressionGatePrompt(
				delta.file,
				delta.type,
				delta.content,
				delta.rationale,
				gc.id,
				gc.description,
				gc.lesson,
				"config text",
			);

			expect(system).toContain("regression testing expert");
			expect(system).toContain("Think step by step");
			expect(user).toContain(gc.id);
			expect(user).toContain(gc.description);
			expect(user).toContain(gc.lesson);
		});

		test("includes proposed change details", () => {
			const delta = makeDelta({ content: "Prefer Go over TypeScript" });
			const gc = makeGoldenCase();
			const { user } = regressionGatePrompt(
				delta.file,
				delta.type,
				delta.content,
				delta.rationale,
				gc.id,
				gc.description,
				gc.lesson,
				"config",
			);

			expect(user).toContain("Prefer Go over TypeScript");
		});
	});

	describe("schema validation", () => {
		test("GoldenCaseJudgment validates pass", () => {
			const valid = {
				case_id: "golden-1",
				reasoning: "Change does not affect this case.",
				verdict: "pass",
				confidence: 0.95,
			};
			expect(() => GoldenCaseJudgment.parse(valid)).not.toThrow();
		});

		test("GoldenCaseJudgment validates fail with risk_description", () => {
			const valid = {
				case_id: "golden-1",
				reasoning: "Change contradicts the golden case.",
				verdict: "fail",
				confidence: 0.85,
				risk_description: "Would reverse the TypeScript preference.",
			};
			expect(() => GoldenCaseJudgment.parse(valid)).not.toThrow();
		});

		test("GoldenCaseJudgment validates uncertain", () => {
			const valid = {
				case_id: "golden-1",
				reasoning: "Not sure if this affects the case.",
				verdict: "uncertain",
				confidence: 0.5,
			};
			expect(() => GoldenCaseJudgment.parse(valid)).not.toThrow();
		});

		test("RegressionGateResult validates full result", () => {
			const valid = {
				overall_reasoning: "All cases pass.",
				per_case_results: [
					{
						case_id: "golden-1",
						reasoning: "No impact.",
						verdict: "pass",
						confidence: 0.9,
					},
				],
				overall_verdict: "pass",
				overall_confidence: 0.9,
			};
			expect(() => RegressionGateResult.parse(valid)).not.toThrow();
		});

		test("RegressionGateResult validates with suggestions", () => {
			const valid = {
				overall_reasoning: "One case fails.",
				per_case_results: [
					{
						case_id: "golden-1",
						reasoning: "Contradicts existing preference.",
						verdict: "fail",
						confidence: 0.85,
						risk_description: "Reverses TS preference.",
					},
				],
				overall_verdict: "fail",
				overall_confidence: 0.85,
				suggestions: "Remove the conflicting line.",
			};
			expect(() => RegressionGateResult.parse(valid)).not.toThrow();
		});
	});
});

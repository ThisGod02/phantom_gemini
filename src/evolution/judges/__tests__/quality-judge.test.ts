import { describe, expect, test } from "bun:test";
import { qualityAssessmentPrompt } from "../prompts.ts";
import { QualityAssessmentResult, QualityDimension } from "../schemas.ts";

describe("quality-judge", () => {
	describe("prompt construction", () => {
		test("includes all evaluation dimensions", () => {
			const { system } = qualityAssessmentPrompt(
				"config text",
				"User: Fix the bug\nAssistant: Fixed it.",
				"bug_fix",
				"5m",
				"5000",
				"Bash, Write",
			);

			expect(system).toContain("ACCURACY");
			expect(system).toContain("HELPFULNESS");
			expect(system).toContain("EFFICIENCY");
			expect(system).toContain("COMMUNICATION STYLE");
			expect(system).toContain("TOOL USAGE");
			expect(system).toContain("ERROR HANDLING");
			expect(system).toContain("regression_signal");
		});

		test("includes calibration anchors", () => {
			const { system } = qualityAssessmentPrompt("c", "t", "general", "1m", "100", "none");

			expect(system).toContain("0.3 overall");
			expect(system).toContain("0.5 overall");
			expect(system).toContain("0.7 overall");
			expect(system).toContain("0.9 overall");
		});

		test("includes session metadata", () => {
			const { user } = qualityAssessmentPrompt(
				"config",
				"transcript",
				"deployment",
				"30m",
				"25000",
				"Bash, Read, Write",
			);

			expect(user).toContain("deployment");
			expect(user).toContain("30m");
			expect(user).toContain("25000");
			expect(user).toContain("Bash, Read, Write");
		});
	});

	describe("schema validation", () => {
		test("QualityDimension validates correct structure", () => {
			const valid = {
				dimension: "accuracy",
				score: 0.85,
				reasoning: "All information was correct.",
				evidence: "Agent cited correct API docs.",
			};
			expect(() => QualityDimension.parse(valid)).not.toThrow();
		});

		test("QualityAssessmentResult validates full result", () => {
			const valid = {
				overall_reasoning: "Good session overall.",
				goal_accomplished: {
					verdict: "yes",
					reasoning: "User's bug was fixed.",
				},
				dimensions: [
					{
						dimension: "accuracy",
						score: 0.9,
						reasoning: "Correct.",
						evidence: "Fixed the bug.",
					},
					{
						dimension: "helpfulness",
						score: 0.85,
						reasoning: "Helpful.",
						evidence: "User was satisfied.",
					},
				],
				errors_or_misconceptions: [],
				overall_score: 0.87,
				regression_signal: false,
			};
			expect(() => QualityAssessmentResult.parse(valid)).not.toThrow();
		});

		test("QualityAssessmentResult validates with regression signal", () => {
			const valid = {
				overall_reasoning: "Quality seems degraded.",
				goal_accomplished: {
					verdict: "partially",
					reasoning: "Task was done but with errors.",
				},
				dimensions: [
					{
						dimension: "accuracy",
						score: 0.4,
						reasoning: "Several errors.",
						evidence: "Wrong API endpoint used twice.",
					},
				],
				errors_or_misconceptions: [
					{
						description: "Used deprecated API.",
						severity: "moderate",
						evidence: "Called /api/v1 instead of /api/v2.",
					},
				],
				overall_score: 0.45,
				regression_signal: true,
				regression_reasoning: "Performance dropped after recent config change.",
			};
			expect(() => QualityAssessmentResult.parse(valid)).not.toThrow();
		});

		test("rejects score out of range", () => {
			const invalid = {
				overall_reasoning: "Test.",
				goal_accomplished: { verdict: "yes", reasoning: "Done." },
				dimensions: [],
				errors_or_misconceptions: [],
				overall_score: 1.5,
				regression_signal: false,
			};
			expect(() => QualityAssessmentResult.parse(invalid)).toThrow();
		});

		test("rejects invalid goal_accomplished verdict", () => {
			const invalid = {
				overall_reasoning: "Test.",
				goal_accomplished: { verdict: "kind_of", reasoning: "Sort of." },
				dimensions: [],
				errors_or_misconceptions: [],
				overall_score: 0.5,
				regression_signal: false,
			};
			expect(() => QualityAssessmentResult.parse(invalid)).toThrow();
		});
	});
});

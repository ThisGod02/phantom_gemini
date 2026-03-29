import { describe, expect, test } from "bun:test";
import { multiJudge } from "../client.ts";
import type { JudgeResult } from "../types.ts";

function mockJudgeResult(verdict: "pass" | "fail", confidence: number): JudgeResult {
	return {
		verdict,
		confidence,
		reasoning: `Mock judge: ${verdict} with ${confidence}`,
		data: { verdict, confidence },
		model: "mock",
		inputTokens: 100,
		outputTokens: 50,
		costUsd: 0.001,
		durationMs: 10,
	};
}

describe("multiJudge", () => {
	describe("minority_veto strategy", () => {
		test("passes when all judges pass", async () => {
			const judges = [
				() => Promise.resolve(mockJudgeResult("pass", 0.95)),
				() => Promise.resolve(mockJudgeResult("pass", 0.9)),
				() => Promise.resolve(mockJudgeResult("pass", 0.85)),
			];
			const result = await multiJudge(judges, "minority_veto", 0.7);
			expect(result.verdict).toBe("pass");
			expect(result.individualResults).toHaveLength(3);
			expect(result.costUsd).toBeCloseTo(0.003, 4);
		});

		test("fails when one judge fails with high confidence", async () => {
			const judges = [
				() => Promise.resolve(mockJudgeResult("pass", 0.9)),
				() => Promise.resolve(mockJudgeResult("fail", 0.85)),
				() => Promise.resolve(mockJudgeResult("pass", 0.9)),
			];
			const result = await multiJudge(judges, "minority_veto", 0.7);
			expect(result.verdict).toBe("fail");
		});

		test("passes when one judge fails but below confidence threshold", async () => {
			const judges = [
				() => Promise.resolve(mockJudgeResult("pass", 0.9)),
				() => Promise.resolve(mockJudgeResult("fail", 0.5)),
				() => Promise.resolve(mockJudgeResult("pass", 0.9)),
			];
			const result = await multiJudge(judges, "minority_veto", 0.7);
			expect(result.verdict).toBe("pass");
		});
	});

	describe("majority strategy", () => {
		test("passes when majority passes", async () => {
			const judges = [
				() => Promise.resolve(mockJudgeResult("pass", 0.9)),
				() => Promise.resolve(mockJudgeResult("fail", 0.8)),
				() => Promise.resolve(mockJudgeResult("pass", 0.9)),
			];
			const result = await multiJudge(judges, "majority");
			expect(result.verdict).toBe("pass");
		});

		test("fails when majority fails", async () => {
			const judges = [
				() => Promise.resolve(mockJudgeResult("fail", 0.9)),
				() => Promise.resolve(mockJudgeResult("fail", 0.8)),
				() => Promise.resolve(mockJudgeResult("pass", 0.9)),
			];
			const result = await multiJudge(judges, "majority");
			expect(result.verdict).toBe("fail");
		});
	});

	describe("unanimous strategy", () => {
		test("passes when all pass", async () => {
			const judges = [
				() => Promise.resolve(mockJudgeResult("pass", 0.9)),
				() => Promise.resolve(mockJudgeResult("pass", 0.85)),
			];
			const result = await multiJudge(judges, "unanimous");
			expect(result.verdict).toBe("pass");
			expect(result.confidence).toBeCloseTo(0.85, 2);
		});

		test("fails when any judge fails", async () => {
			const judges = [
				() => Promise.resolve(mockJudgeResult("pass", 0.9)),
				() => Promise.resolve(mockJudgeResult("fail", 0.3)),
			];
			const result = await multiJudge(judges, "unanimous");
			expect(result.verdict).toBe("fail");
		});
	});

	describe("cost tracking", () => {
		test("sums costs from all judges", async () => {
			const judges = [
				() => Promise.resolve(mockJudgeResult("pass", 0.9)),
				() => Promise.resolve(mockJudgeResult("pass", 0.9)),
				() => Promise.resolve(mockJudgeResult("pass", 0.9)),
			];
			const result = await multiJudge(judges, "minority_veto");
			expect(result.costUsd).toBeCloseTo(0.003, 4);
		});
	});
});

import { describe, expect, test } from "bun:test";
import { consolidationPrompt } from "../prompts.ts";
import { ConsolidationJudgeResult, DetectedProcedure, ExtractedFact } from "../schemas.ts";

describe("consolidation-judge", () => {
	describe("prompt construction", () => {
		test("includes session transcript and existing facts", () => {
			const { system, user } = consolidationPrompt(
				"User: Fix the login bug\nAssistant: Found it, the token was expired.",
				"User prefers TypeScript.",
				"5m",
				"Bash, Write",
				"bug_fix",
				"success",
			);

			expect(system).toContain("memory consolidation system");
			expect(system).toContain("FACTS");
			expect(system).toContain("PROCEDURES");
			expect(system).toContain("CONTRADICTIONS");
			expect(user).toContain("Fix the login bug");
			expect(user).toContain("prefers TypeScript");
		});

		test("includes metadata fields", () => {
			const { user } = consolidationPrompt("transcript", "facts", "10m", "Bash, Read", "deployment", "failure");

			expect(user).toContain("10m");
			expect(user).toContain("Bash, Read");
			expect(user).toContain("deployment");
			expect(user).toContain("failure");
		});
	});

	describe("schema validation", () => {
		test("ExtractedFact validates correct structure", () => {
			const valid = {
				natural_language: "User prefers dark mode.",
				subject: "user",
				predicate: "prefers",
				object: "dark mode",
				category: "user_preference",
				confidence: 0.9,
				evidence: "I always use dark mode",
				is_update: false,
			};
			expect(() => ExtractedFact.parse(valid)).not.toThrow();
		});

		test("ExtractedFact validates update with contradicted fact", () => {
			const valid = {
				natural_language: "User now prefers light mode.",
				subject: "user",
				predicate: "prefers",
				object: "light mode",
				category: "user_preference",
				confidence: 0.8,
				evidence: "Switch to light mode please",
				is_update: true,
				contradicted_fact: "User prefers dark mode.",
			};
			expect(() => ExtractedFact.parse(valid)).not.toThrow();
		});

		test("DetectedProcedure validates correct structure", () => {
			const valid = {
				name: "deploy-to-staging",
				description: "Deploy the app to staging environment.",
				trigger: "When user says 'deploy to staging'.",
				steps: ["Run tests", "Build", "Push to staging"],
				confidence: 0.7,
				evidence: "The user walked through this exact workflow.",
			};
			expect(() => DetectedProcedure.parse(valid)).not.toThrow();
		});

		test("ConsolidationJudgeResult validates full result", () => {
			const valid = {
				reasoning: "Session had useful learnings.",
				extracted_facts: [
					{
						natural_language: "Project uses Bun.",
						subject: "project",
						predicate: "uses",
						object: "Bun",
						category: "codebase",
						confidence: 0.95,
						evidence: "We use Bun for everything.",
						is_update: false,
					},
				],
				detected_procedures: [],
				episode_importance: 0.6,
				episode_importance_reasoning: "Learned about the tech stack.",
				contradiction_alerts: [],
				key_takeaways: ["Project uses Bun runtime", "TypeScript without compilation"],
			};
			expect(() => ConsolidationJudgeResult.parse(valid)).not.toThrow();
		});

		test("ConsolidationJudgeResult validates with contradictions", () => {
			const valid = {
				reasoning: "Found a contradiction.",
				extracted_facts: [],
				detected_procedures: [],
				episode_importance: 0.5,
				episode_importance_reasoning: "Routine session.",
				contradiction_alerts: [
					{
						new_fact: "User prefers Go.",
						existing_fact: "User prefers TypeScript.",
						resolution: "new_supersedes",
						reasoning: "User explicitly stated preference change.",
					},
				],
				key_takeaways: ["User switched from TypeScript to Go."],
			};
			expect(() => ConsolidationJudgeResult.parse(valid)).not.toThrow();
		});
	});
});

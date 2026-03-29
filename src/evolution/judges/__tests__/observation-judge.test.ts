import { describe, expect, test } from "bun:test";
import { toSessionObservations } from "../observation-judge.ts";
import type { ObservationExtractionResultType } from "../schemas.ts";

describe("observation-judge", () => {
	describe("toSessionObservations", () => {
		test("maps explicit_correction to correction type", () => {
			const result: ObservationExtractionResultType = {
				session_summary: "User corrected agent about language preference.",
				session_outcome: "success",
				observations: [
					{
						type: "explicit_correction",
						summary: "User prefers TypeScript over JavaScript.",
						detail: "User said to use TypeScript not JavaScript.",
						evidence: "No, use TypeScript not JavaScript",
						importance: 0.8,
						importance_reasoning: "Affects all future code generation.",
						affected_config_files: ["user-profile.md"],
					},
				],
				implicit_signals: {
					user_satisfaction: 0.7,
					user_satisfaction_evidence: "User continued working after correction.",
					agent_performance: 0.6,
					agent_performance_evidence: "Needed correction but recovered.",
				},
				meta: {
					total_user_messages: 1,
					total_corrections: 1,
					tools_used: ["Write"],
					primary_task_type: "code_generation",
				},
			};

			const observations = toSessionObservations(result);
			expect(observations).toHaveLength(1);
			expect(observations[0].type).toBe("correction");
			expect(observations[0].content).toBe("User prefers TypeScript over JavaScript.");
			expect(observations[0].confidence).toBe(0.8);
		});

		test("maps preference_stated to preference type", () => {
			const result: ObservationExtractionResultType = {
				session_summary: "User stated a preference.",
				session_outcome: "success",
				observations: [
					{
						type: "preference_stated",
						summary: "User prefers Vim keybindings.",
						detail: "User explicitly said they prefer Vim.",
						evidence: "I prefer using Vim keybindings",
						importance: 0.6,
						importance_reasoning: "Editor preference.",
						affected_config_files: ["user-profile.md"],
					},
				],
				implicit_signals: {
					user_satisfaction: 0.8,
					user_satisfaction_evidence: "Positive tone.",
					agent_performance: 0.7,
					agent_performance_evidence: "Good session.",
				},
				meta: { total_user_messages: 1, total_corrections: 0, tools_used: [], primary_task_type: "general" },
			};

			const observations = toSessionObservations(result);
			expect(observations[0].type).toBe("preference");
		});

		test("maps task_failed to error type", () => {
			const result: ObservationExtractionResultType = {
				session_summary: "Session failed.",
				session_outcome: "failure",
				observations: [
					{
						type: "task_failed",
						summary: "Deploy script failed.",
						detail: "The deployment failed due to SSH timeout.",
						evidence: "Error: SSH connection timed out",
						importance: 0.9,
						importance_reasoning: "Deployment failure.",
						affected_config_files: ["strategies/error-recovery.md"],
					},
				],
				implicit_signals: {
					user_satisfaction: 0.2,
					user_satisfaction_evidence: "User seemed frustrated.",
					agent_performance: 0.3,
					agent_performance_evidence: "Could not complete task.",
				},
				meta: { total_user_messages: 3, total_corrections: 0, tools_used: ["Bash"], primary_task_type: "deployment" },
			};

			const observations = toSessionObservations(result);
			expect(observations[0].type).toBe("error");
		});

		test("handles empty observations", () => {
			const result: ObservationExtractionResultType = {
				session_summary: "Quick question session.",
				session_outcome: "success",
				observations: [],
				implicit_signals: {
					user_satisfaction: 0.7,
					user_satisfaction_evidence: "Fine.",
					agent_performance: 0.7,
					agent_performance_evidence: "Fine.",
				},
				meta: { total_user_messages: 1, total_corrections: 0, tools_used: [], primary_task_type: "general" },
			};

			const observations = toSessionObservations(result);
			expect(observations).toHaveLength(0);
		});

		test("maps multiple observation types correctly", () => {
			const result: ObservationExtractionResultType = {
				session_summary: "Complex session.",
				session_outcome: "partial_success",
				observations: [
					{
						type: "explicit_correction",
						summary: "Correction A",
						detail: "Detail A",
						evidence: "Evidence A",
						importance: 0.8,
						importance_reasoning: "Reason A",
						affected_config_files: ["user-profile.md"],
					},
					{
						type: "domain_fact_learned",
						summary: "Fact B",
						detail: "Detail B",
						evidence: "Evidence B",
						importance: 0.5,
						importance_reasoning: "Reason B",
						affected_config_files: ["domain-knowledge.md"],
					},
					{
						type: "workflow_pattern",
						summary: "Pattern C",
						detail: "Detail C",
						evidence: "Evidence C",
						importance: 0.7,
						importance_reasoning: "Reason C",
						affected_config_files: ["strategies/task-patterns.md"],
					},
				],
				implicit_signals: {
					user_satisfaction: 0.5,
					user_satisfaction_evidence: "Mixed.",
					agent_performance: 0.5,
					agent_performance_evidence: "Partial.",
				},
				meta: {
					total_user_messages: 5,
					total_corrections: 1,
					tools_used: ["Bash", "Write"],
					primary_task_type: "general",
				},
			};

			const observations = toSessionObservations(result);
			expect(observations).toHaveLength(3);
			expect(observations[0].type).toBe("correction");
			expect(observations[1].type).toBe("domain_fact");
			expect(observations[2].type).toBe("tool_pattern");
		});
	});
});

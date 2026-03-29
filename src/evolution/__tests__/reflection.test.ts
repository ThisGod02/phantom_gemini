import { describe, expect, test } from "bun:test";
import { buildCritiqueFromObservations, extractObservations, generateDeltas } from "../reflection.ts";
import type { EvolvedConfig, SessionSummary } from "../types.ts";

function makeSession(overrides: Partial<SessionSummary> = {}): SessionSummary {
	return {
		session_id: "session-001",
		session_key: "cli:main",
		user_id: "user-1",
		user_messages: ["Hello, help me with TypeScript"],
		assistant_messages: ["Sure, I can help with TypeScript."],
		tools_used: [],
		files_tracked: [],
		outcome: "success",
		cost_usd: 0.05,
		started_at: "2026-03-25T10:00:00Z",
		ended_at: "2026-03-25T10:05:00Z",
		...overrides,
	};
}

function makeEvolvedConfig(): EvolvedConfig {
	return {
		constitution: "# Constitution\n1. Be honest.",
		persona: "# Persona\n- Be direct.",
		userProfile: "# User Profile\n",
		domainKnowledge: "# Domain Knowledge\n",
		strategies: {
			taskPatterns: "",
			toolPreferences: "",
			errorRecovery: "",
		},
		meta: {
			version: 1,
			metricsSnapshot: { session_count: 10, success_rate_7d: 0.9, correction_rate_7d: 0.1 },
		},
	};
}

describe("extractObservations", () => {
	test("extracts corrections from user messages", () => {
		const session = makeSession({
			user_messages: ["No, use TypeScript not JavaScript"],
		});
		const observations = extractObservations(session);
		const corrections = observations.filter((o) => o.type === "correction");
		expect(corrections.length).toBeGreaterThan(0);
		expect(corrections[0].content).toContain("TypeScript");
	});

	test("extracts preferences from user messages", () => {
		const session = makeSession({
			user_messages: ["I prefer using Bun instead of Node.js"],
		});
		const observations = extractObservations(session);
		const preferences = observations.filter((o) => o.type === "preference");
		expect(preferences.length).toBeGreaterThan(0);
	});

	test("records errors when session fails", () => {
		const session = makeSession({ outcome: "failure" });
		const observations = extractObservations(session);
		const errors = observations.filter((o) => o.type === "error");
		expect(errors.length).toBeGreaterThan(0);
	});

	test("records success for successful sessions", () => {
		const session = makeSession({ outcome: "success" });
		const observations = extractObservations(session);
		const successes = observations.filter((o) => o.type === "success");
		expect(successes.length).toBeGreaterThan(0);
	});

	test("records tool patterns when tools are used", () => {
		const session = makeSession({ tools_used: ["Read", "Write", "Bash"] });
		const observations = extractObservations(session);
		const toolPatterns = observations.filter((o) => o.type === "tool_pattern");
		expect(toolPatterns.length).toBeGreaterThan(0);
		expect(toolPatterns[0].content).toContain("Read");
	});

	test("extracts domain facts from user messages", () => {
		const session = makeSession({
			user_messages: ["Our team uses PostgreSQL for all databases"],
		});
		const observations = extractObservations(session);
		const domainFacts = observations.filter((o) => o.type === "domain_fact");
		expect(domainFacts.length).toBeGreaterThan(0);
	});

	test("returns empty for sessions with no signals", () => {
		const session = makeSession({
			user_messages: ["What time is it?"],
			tools_used: [],
			outcome: "success",
		});
		const observations = extractObservations(session);
		// Should at least have a success observation
		expect(observations.filter((o) => o.type === "success").length).toBe(1);
	});
});

describe("buildCritiqueFromObservations", () => {
	test("produces suggested changes for corrections", () => {
		const session = makeSession({ user_messages: ["No, use TypeScript not JavaScript"] });
		const observations = extractObservations(session);
		const critique = buildCritiqueFromObservations(observations, session, makeEvolvedConfig());

		expect(critique.corrections_detected.length).toBeGreaterThan(0);
		expect(critique.suggested_changes.length).toBeGreaterThan(0);
		expect(critique.suggested_changes[0].file).toBe("user-profile.md");
	});

	test("produces no changes for simple successful sessions", () => {
		const session = makeSession({ user_messages: ["What is 2+2?"] });
		const observations = extractObservations(session);
		const critique = buildCritiqueFromObservations(observations, session, makeEvolvedConfig());

		expect(critique.suggested_changes.length).toBe(0);
	});

	test("critique format has all required fields", () => {
		const session = makeSession({ user_messages: ["Actually, always use tabs not spaces"] });
		const observations = extractObservations(session);
		const critique = buildCritiqueFromObservations(observations, session, makeEvolvedConfig());

		expect(critique).toHaveProperty("overall_assessment");
		expect(critique).toHaveProperty("what_worked");
		expect(critique).toHaveProperty("what_failed");
		expect(critique).toHaveProperty("corrections_detected");
		expect(critique).toHaveProperty("suggested_changes");
	});
});

describe("generateDeltas", () => {
	test("converts critique suggestions to ConfigDelta objects", () => {
		const session = makeSession({ user_messages: ["No, use TypeScript not JavaScript"] });
		const observations = extractObservations(session);
		const critique = buildCritiqueFromObservations(observations, session, makeEvolvedConfig());
		const deltas = generateDeltas(critique, session.session_id);

		expect(deltas.length).toBeGreaterThan(0);
		for (const delta of deltas) {
			expect(delta).toHaveProperty("file");
			expect(delta).toHaveProperty("type");
			expect(delta).toHaveProperty("content");
			expect(delta).toHaveProperty("rationale");
			expect(delta).toHaveProperty("session_ids");
			expect(delta).toHaveProperty("tier");
			expect(delta.session_ids).toContain(session.session_id);
		}
	});

	test("returns empty for critiques with no suggestions", () => {
		const session = makeSession({ user_messages: ["What is 2+2?"] });
		const observations = extractObservations(session);
		const critique = buildCritiqueFromObservations(observations, session, makeEvolvedConfig());
		const deltas = generateDeltas(critique, session.session_id);

		expect(deltas.length).toBe(0);
	});
});

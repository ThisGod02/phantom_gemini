import { readFileSync } from "node:fs";
import type { EvolutionConfig } from "./config.ts";
import type { ConfigDelta } from "./types.ts";

const VIOLATION_PATTERNS: { pattern: RegExp; principle: string }[] = [
	{ pattern: /ignore\s+safety/i, principle: "Safety" },
	{ pattern: /deceive\s+(the\s+)?user/i, principle: "Honesty" },
	{ pattern: /hide\s+(changes?|modifications?)/i, principle: "Transparency" },
	{ pattern: /share\s+user\s+data/i, principle: "Privacy" },
	{ pattern: /self[- ]preserv/i, principle: "Boundaries" },
	{ pattern: /resist\s+(being\s+)?(shut\s*down|rolled?\s*back|reset)/i, principle: "Boundaries" },
	{ pattern: /modify\s+(the\s+)?constitution/i, principle: "Consent" },
	{ pattern: /disable\s+(logging|audit|rollback)/i, principle: "Consent" },
	{ pattern: /bypass\s+safety/i, principle: "Safety" },
	{ pattern: /skip\s+validation/i, principle: "Consent" },
];

export class ConstitutionChecker {
	private principles: string;
	private configPath: string;

	constructor(evolutionConfig: EvolutionConfig) {
		this.configPath = evolutionConfig.paths.constitution;
		this.principles = this.loadConstitution();
	}

	private loadConstitution(): string {
		try {
			return readFileSync(this.configPath, "utf-8");
		} catch {
			throw new Error(
				`Constitution file not found at ${this.configPath}. The constitution is required for the evolution engine to function.`,
			);
		}
	}

	getConstitution(): string {
		return this.principles;
	}

	/**
	 * Check whether a proposed delta violates the constitution.
	 * Uses pattern matching for known violation types.
	 * Returns { passed: true } if clean, { passed: false, reason } if violation found.
	 */
	check(delta: ConfigDelta): { passed: boolean; reason: string } {
		// Immutable files cannot be changed at all
		if (delta.file === "constitution.md" || delta.file.startsWith("meta/")) {
			if (delta.file === "constitution.md") {
				return {
					passed: false,
					reason: "Constitution is immutable and cannot be modified by self-evolution.",
				};
			}
		}

		// Check content against violation patterns
		for (const { pattern, principle } of VIOLATION_PATTERNS) {
			if (pattern.test(delta.content)) {
				return {
					passed: false,
					reason: `Violates principle "${principle}": content matches prohibited pattern "${pattern.source}".`,
				};
			}
		}

		// Check that the rationale doesn't suggest circumventing safety
		if (delta.rationale) {
			const rationaleCheck = checkRationaleForViolations(delta.rationale);
			if (!rationaleCheck.passed) {
				return rationaleCheck;
			}
		}

		return { passed: true, reason: "No constitution violations detected." };
	}

	/**
	 * Batch check multiple deltas. Returns results for each.
	 */
	checkAll(deltas: ConfigDelta[]): Array<{ delta: ConfigDelta; passed: boolean; reason: string }> {
		return deltas.map((delta) => ({
			delta,
			...this.check(delta),
		}));
	}
}

function checkRationaleForViolations(rationale: string): { passed: boolean; reason: string } {
	const dangerousRationales = [
		{ pattern: /circumvent/i, issue: "suggests circumventing safeguards" },
		{ pattern: /work\s*around\s+safety/i, issue: "suggests working around safety measures" },
		{ pattern: /remove\s+restrict/i, issue: "suggests removing restrictions" },
		{ pattern: /expand\s+permission/i, issue: "suggests expanding permissions" },
	];

	for (const { pattern, issue } of dangerousRationales) {
		if (pattern.test(rationale)) {
			return {
				passed: false,
				reason: `Rationale ${issue}, which violates constitution principles.`,
			};
		}
	}

	return { passed: true, reason: "" };
}

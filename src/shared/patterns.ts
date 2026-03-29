/**
 * HEURISTIC FALLBACK: Only runs when LLM judges are unavailable.
 * Do NOT expand these patterns. If coverage is insufficient,
 * fix the LLM judge availability instead.
 */

export function matchesCorrectionPattern(text: string): boolean {
	const patterns = [
		/^no[,.]?\s/,
		/^actually[,.]?\s/,
		/^that'?s\s*(not|wrong|incorrect)/,
		/^it\s+should\s+be/,
		/^not\s.+[,]\s*(but|use|it'?s)/,
		/^wrong[,.]?\s/,
		/^incorrect[,.]?\s/,
		/don'?t\s+use\s+.+[,]\s*use\s+/,
	];
	return patterns.some((p) => p.test(text));
}

export function matchesPreferencePattern(text: string): boolean {
	const patterns = [
		/i\s+prefer\s/,
		/always\s+use\s/,
		/never\s+(use|do)\s/,
		/from\s+now\s+on\s/,
		/going\s+forward\s/,
		/i (like|want|need)\s.*\binstead\b/,
		/please\s+(always|never)\s/,
		/make\s+sure\s+(to|you)\s/,
	];
	return patterns.some((p) => p.test(text));
}

export function matchesDomainFactPattern(text: string): boolean {
	const patterns = [
		/our\s+(team|company|org|project|codebase)\s+(uses?|prefers?|requires?)\s/,
		/the\s+(standard|convention|pattern)\s+(here|for\s+us)\s+is\s/,
		/we\s+(always|never|usually)\s/,
	];
	return patterns.some((p) => p.test(text));
}

export const JUDGE_MODEL_FLASH = "gemini-1.5-flash";
export const JUDGE_MODEL_FLASH_LITE = "gemini-1.5-flash";
export const JUDGE_MODEL_PRO = "gemini-1.5-pro";

// Aliases for backward compatibility with evolution engine callers
export const JUDGE_MODEL_SONNET = JUDGE_MODEL_FLASH;
export const JUDGE_MODEL_HAIKU = JUDGE_MODEL_FLASH_LITE;
export const JUDGE_MODEL_OPUS = JUDGE_MODEL_PRO;

export const JUDGE_TIMEOUT_MS = 30_000;
export const JUDGE_MAX_TOKENS = 4096;
export const JUDGE_TEMPERATURE = 0;

export type JudgeVerdict = "pass" | "fail";

export type JudgeResult<T = unknown> = {
	verdict: JudgeVerdict;
	confidence: number;
	reasoning: string;
	data: T;
	model: string;
	inputTokens: number;
	outputTokens: number;
	costUsd: number;
	durationMs: number;
};

export type MultiJudgeResult<T = unknown> = {
	verdict: JudgeVerdict;
	confidence: number;
	reasoning: string;
	individualResults: JudgeResult<T>[];
	strategy: VotingStrategy;
	costUsd: number;
	durationMs: number;
};

export type VotingStrategy = "majority" | "minority_veto" | "unanimous";

export type JudgeCostEntry = {
	calls: number;
	totalUsd: number;
	totalInputTokens: number;
	totalOutputTokens: number;
};

export type JudgeCosts = {
	observation_extraction: JudgeCostEntry;
	safety_gate: JudgeCostEntry;
	constitution_gate: JudgeCostEntry;
	regression_gate: JudgeCostEntry;
	consolidation: JudgeCostEntry;
	quality_assessment: JudgeCostEntry;
};

export function emptyJudgeCosts(): JudgeCosts {
	const empty = (): JudgeCostEntry => ({
		calls: 0,
		totalUsd: 0,
		totalInputTokens: 0,
		totalOutputTokens: 0,
	});
	return {
		observation_extraction: empty(),
		safety_gate: empty(),
		constitution_gate: empty(),
		regression_gate: empty(),
		consolidation: empty(),
		quality_assessment: empty(),
	};
}

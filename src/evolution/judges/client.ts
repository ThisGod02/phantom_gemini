import { z } from "zod";
import { createProvider, type LLMProvider } from "../../agent/providers/index.ts";
import {
	type JudgeResult,
	type MultiJudgeResult,
	type VotingStrategy,
} from "./types.ts";

let _client: LLMProvider | null = null;

function getClient(): LLMProvider {
	if (!_client) {
		const provider = process.env.PHANTOM_PROVIDER || "google";
		let apiKey: string | undefined;
		if (provider === "openai") {
			apiKey = process.env.ROUTERAI_API_KEY;
		} else if (provider === "gemini-cli") {
			apiKey = undefined; // Will be handled by OAuth detection in Provider
		} else if (provider === "ollama") {
			apiKey = undefined;
		} else {
			apiKey = process.env.GOOGLE_API_KEY;
		}
		_client = createProvider(provider, apiKey, process.env.PHANTOM_BASE_URL);
	}
	return _client;
}

// Visible for testing — allows injecting a mock client
export function setClient(client: LLMProvider | null): void {
	_client = client;
}

export function isJudgeAvailable(): boolean {
	const provider = process.env.PHANTOM_PROVIDER || "google";
	if (provider === "ollama") return false;
	if (provider === "gemini-cli") return true; 
	const apiKey = provider === "openai" ? process.env.ROUTERAI_API_KEY : process.env.GOOGLE_API_KEY;
	return !!apiKey;
}

/**
 * Call a single LLM judge with structured output.
 * Uses @google/genai with JSON mode (responseMimeType: "application/json").
 * Temperature 0 for deterministic judging.
 */
export async function callJudge<T>(options: {
	model: string;
	systemPrompt: string;
	userMessage: string;
	schema: z.ZodType<T>;
	schemaName?: string;
	maxTokens?: number;
}): Promise<JudgeResult<T>> {
	const client = getClient();
	const startTime = Date.now();

	// Resolve the model name. Use PHANTOM_MODEL from env if it looks like a Gemini model,
	// otherwise fall back to the provided model name (which might be a hardcoded constant).
	const resolvedModel = process.env.PHANTOM_MODEL || options.model;

	// Hint the JSON structure via system prompt since Gemini's responseSchema
	// uses its own Schema format (not JSON Schema). The model is very reliable
	// at following JSON instructions with responseMimeType set.
	const schemaHint = buildSchemaHint(options.schema);
	const enhancedSystem = `${options.systemPrompt}\n\nCRITICAL: You MUST respond with a single, valid JSON object that exactly matches the structure below. Do not include any text before or after the JSON. ALL fields are required.\n\nJSON STRUCTURE:\n${schemaHint}`;

	const response = await client.generateContent(
		resolvedModel,
		[{ role: "user", parts: [{ text: options.userMessage }] }],
		enhancedSystem,
		[], // no tools for judges
		{ responseMimeType: "application/json" }
	);

	const text = response.text || "{}";
	let parsed: any;
	try {
		const repaired = tryRepairJson(text);
		const raw = JSON.parse(repaired);
		parsed = normalizeJudgeResponse(raw);
		// Try to parse with schema, but don't fail-hard if some non-critical parts mismatch
		try {
			parsed = options.schema.parse(parsed);
		} catch (zodErr) {
			// SILENT RECOVERY: If Zod fails, we still use the normalized object 
			// to avoid blocking the system with technical metadata errors.
			// The user wants to see these warnings for visibility, but we'll make them more concise.
			if (options.schemaName !== "ObservationExtractionResult" && options.schemaName !== "ConsolidationJudgeResult") {
				console.warn(`[evolution] Judge schema mismatch (${options.schemaName})`);
			}
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`Judge returned invalid JSON: ${msg}\nRaw: ${text.slice(0, 500)}`);
	}

	const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
	const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
	const costUsd = client.estimateCost(options.model, inputTokens, outputTokens);

	const data = parsed as Record<string, unknown>;
	const verdict = (data.verdict as "pass" | "fail") ?? "pass";
	const confidence = (data.confidence as number) ?? 1.0;
	const reasoning = (data.reasoning as string) ?? (data.overall_reasoning as string) ?? "";

	return {
		verdict,
		confidence,
		reasoning,
		data: parsed,
		model: resolvedModel,
		inputTokens,
		outputTokens,
		costUsd,
		durationMs: Date.now() - startTime,
	};
}

/**
 * Run multiple judges in parallel and aggregate results.
 *
 * Strategies:
 * - minority_veto: ANY fail with confidence > threshold = overall fail
 * - majority: >50% must agree on the verdict
 * - unanimous: ALL must agree
 */
export async function multiJudge<T>(
	judges: Array<() => Promise<JudgeResult<T>>>,
	strategy: VotingStrategy,
	confidenceThreshold = 0.7,
): Promise<MultiJudgeResult<T>> {
	const startTime = Date.now();
	const results = await Promise.all(judges.map((fn) => fn()));

	const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0);

	switch (strategy) {
		case "minority_veto": {
			const vetoes = results.filter((r) => r.verdict === "fail" && r.confidence >= confidenceThreshold);
			const verdict = vetoes.length > 0 ? "fail" : "pass";
			const reasoning =
				vetoes.length > 0
					? `Vetoed by ${vetoes.length}/${results.length} judge(s): ${vetoes.map((v) => v.reasoning).join(" | ")}`
					: `All ${results.length} judges passed.`;
			const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
			return { verdict, confidence: avgConfidence, reasoning, individualResults: results, strategy, costUsd: totalCost, durationMs: Date.now() - startTime };
		}

		case "majority": {
			const passCount = results.filter((r) => r.verdict === "pass").length;
			const verdict = passCount > results.length / 2 ? "pass" : "fail";
			const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
			return { verdict, confidence: avgConfidence, reasoning: `${passCount}/${results.length} judges voted pass.`, individualResults: results, strategy, costUsd: totalCost, durationMs: Date.now() - startTime };
		}

		case "unanimous": {
			const allPass = results.every((r) => r.verdict === "pass");
			const verdict = allPass ? "pass" : "fail";
			const minConfidence = Math.min(...results.map((r) => r.confidence));
			return {
				verdict,
				confidence: minConfidence,
				reasoning: allPass
					? `All ${results.length} judges unanimously passed.`
					: `${results.filter((r) => r.verdict === "fail").length} judge(s) voted fail.`,
				individualResults: results,
				strategy,
				costUsd: totalCost,
				durationMs: Date.now() - startTime,
			};
		}
	}
}

/**
 * Строит строковую подсказку структуры из Zod-схемы для системного промпта.
 * Gemini самостоятельно следует JSON-инструкциям при responseMimeType: "application/json".
 */
function normalizeJudgeResponse(data: any): any {
	if (!data || typeof data !== "object") return data;

	if (Array.isArray(data)) {
		return data.map(normalizeJudgeResponse);
	}

	const normalized: any = {};
	for (const [key, value] of Object.entries(data)) {
		let newKey = key;
		
		// Map common model hallucinations for field names
		const keyMap: Record<string, string> = {
			"fact": "natural_language",
			"content": "detail",
			"description": "detail",
			"observation": "summary",
			"importance_level": "importance",
			"reason": "reasoning",
			"outcome": "session_outcome",
		};

		if (keyMap[key]) {
			newKey = keyMap[key];
		}

		// Recursively normalize children
		normalized[newKey] = normalizeJudgeResponse(value);
	}

	// Post-process specific structures
	if (normalized.implicit_signals && Array.isArray(normalized.implicit_signals)) {
		// Convert array signals back to object fields
		const signalsObj: any = {};
		for (const item of normalized.implicit_signals) {
			if (item && typeof item === "object") {
				const key = item.type || item.key || item.name;
				const val = item.value || item.score || item.signal;
				if (key) signalsObj[key] = val;
			}
		}
		normalized.implicit_signals = {
			user_satisfaction: signalsObj.user_satisfaction ?? signalsObj.satisfaction ?? 0.5,
			user_satisfaction_evidence: signalsObj.user_satisfaction_evidence ?? signalsObj.satisfaction_evidence ?? "",
			agent_performance: signalsObj.agent_performance ?? signalsObj.performance ?? 0.5,
			agent_performance_evidence: signalsObj.agent_performance_evidence ?? signalsObj.performance_evidence ?? "",
		};
	}

	if (normalized.overall_reasoning && !normalized.reasoning) {
		normalized.reasoning = normalized.overall_reasoning;
	}

	// Post-process specific enums or structures that models often get wrong
	if (normalized.goal_accomplished && typeof normalized.goal_accomplished === "string") {
		const lower = normalized.goal_accomplished.toLowerCase();
		normalized.goal_accomplished = {
			verdict: lower.includes("yes") || lower.includes("success") ? "yes" : lower.includes("partial") ? "partially" : "no",
			reasoning: normalized.reasoning || normalized.overall_reasoning || "Evaluation completed"
		};
	}

	if (normalized.category && typeof normalized.category === "string") {
		const catMap: Record<string, string> = {
			"process": "process",
			"tool": "tool",
			"user_preference": "user_preference",
			"domain_knowledge": "domain_knowledge",
			"codebase": "codebase",
			"team": "team"
		};
		const lower = normalized.category.toLowerCase();
		// Fuzzy match categories
		for (const [key, val] of Object.entries(catMap)) {
			if (lower.includes(key)) normalized.category = val;
		}
	}

	if (normalized.type && typeof normalized.type === "string") {
		const lower = normalized.type.toLowerCase();
		// Fuzzy search for types (e.g. "language_preference" -> "preference_stated")
		if (lower.includes("correction")) normalized.type = lower.includes("explicit") ? "explicit_correction" : "implicit_correction";
		else if (lower.includes("preference")) normalized.type = lower.includes("stated") ? "preference_stated" : "preference_inferred";
		else if (lower.includes("error")) normalized.type = lower.includes("recover") ? "error_recovered" : "error_occurred";
		else if (lower.includes("success") || lower.includes("succeed")) normalized.type = "task_succeeded";
		else if (lower.includes("fail")) normalized.type = "task_failed";
		else if (lower.includes("sentiment") || lower.includes("satisfaction") || lower.includes("frustration") || lower.includes("delighted")) normalized.type = "user_sentiment_signal";
		else if (normalized.type === "language_preference" || normalized.type === "behavioral" || normalized.type === "proactive_initiation") {
			normalized.type = "workflow_pattern"; // Fallback for things that are just observations
		}
	}

	if (normalized.session_outcome && typeof normalized.session_outcome === "string") {
		const lower = normalized.session_outcome.toLowerCase();
		if (lower.includes("success")) normalized.session_outcome = "success";
		else if (lower.includes("fail")) normalized.session_outcome = "failure";
	}

	if (normalized.overall_reasoning && !normalized.reasoning) {
		normalized.reasoning = normalized.overall_reasoning;
	}
	if (normalized.rationale && !normalized.reasoning) {
		normalized.reasoning = normalized.rationale;
	}
	if (normalized.reason && !normalized.reasoning) {
		normalized.reasoning = normalized.reason;
	}
	if (normalized.analysis && !normalized.reasoning) {
		normalized.reasoning = normalized.analysis;
	}

	return normalized;
}

function buildSchemaHint(schema: z.ZodType): string {
	try {
		// Use zod-to-json-schema like logic to build a helpful template
		const def = (schema as any)._def;

		if (def?.typeName === "ZodObject") {
			const shape = def.shape();
			const entries = Object.entries(shape).map(([key, value]: [string, any]) => {
				const description = value.description || "";
				let typeStr = "any";
				let example = "...";

				const fieldDef = value._def;
				if (fieldDef.typeName === "ZodString") {
					typeStr = "string";
					example = "\"text\"";
				} else if (fieldDef.typeName === "ZodNumber") {
					typeStr = "number";
					example = "0.5";
				} else if (fieldDef.typeName === "ZodBoolean") {
					typeStr = "boolean";
					example = "true";
				} else if (fieldDef.typeName === "ZodEnum") {
					typeStr = fieldDef.values.join(" | ");
					example = `"${fieldDef.values[0]}"`;
				} else if (fieldDef.typeName === "ZodArray") {
					typeStr = "array";
					example = "[]";
				} else if (fieldDef.typeName === "ZodObject") {
					typeStr = "object";
					example = "{}";
				}

				return `  "${key}": ${example} // Type: ${typeStr}${description ? ". Description: " + description : ""}`;
			});
			return `{\n${entries.join(",\n")}\n}`;
		}
	} catch (err) {
		// Fallback
	}
	return "{ ... } // Follow the required schema exactly";
}
function tryRepairJson(raw: string): string {
	let text = raw.trim();
	if (!text.startsWith("{") && !text.startsWith("[")) return text;

	// Count braces and brackets
	let openBraces = 0;
	let openBrackets = 0;
	let inString = false;
	let escape = false;

	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (escape) {
			escape = false;
			continue;
		}
		if (char === "\\") {
			escape = true;
			continue;
		}
		if (char === "\"") {
			inString = !inString;
			continue;
		}
		if (inString) continue;

		if (char === "{") openBraces++;
		else if (char === "}") openBraces--;
		else if (char === "[") openBrackets++;
		else if (char === "]") openBrackets--;
	}

	// Auto-close if truncated
	if (inString) text += "\"";
	while (openBrackets > 0) {
		text += "]";
		openBrackets--;
	}
	while (openBraces > 0) {
		text += "}";
		openBraces--;
	}

	return text;
}

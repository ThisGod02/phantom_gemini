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
		const apiKey = provider === "openai" ? process.env.ROUTERAI_API_KEY : process.env.GOOGLE_API_KEY;
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
		[] // no tools for judges
	);

	const rawText = response.text ?? "";
	let parsed: T;
	try {
		const rawJson = JSON.parse(rawText);
		parsed = options.schema.parse(rawJson);
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(`Judge returned invalid JSON or schema mismatch: ${msg}\nRaw: ${rawText.slice(0, 500)}`);
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


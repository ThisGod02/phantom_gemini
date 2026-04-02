import { FunctionCallingConfigMode, GoogleGenAI, type Content, type Tool } from "@google/genai";
import type { LLMProvider, ProviderResponse } from "./types.ts";

export class GeminiProvider implements LLMProvider {
	private client: GoogleGenAI;

	constructor(apiKey?: string) {
		this.client = new GoogleGenAI({ apiKey: apiKey || process.env.GOOGLE_API_KEY });
	}

	async generateContent(
		model: string,
		contents: Content[],
		systemInstruction: string,
		tools: Tool[],
	): Promise<ProviderResponse> {
		// Detect max logic
		const isMax = process.env.PHANTOM_EFFORT === 'max' || model.includes('pro');
		
		const response = await this.client.models.generateContent({
			model,
			contents,
			config: {
				systemInstruction,
				tools,
				toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
				...(isMax ? { maxOutputTokens: 8192 } : {}),
			},
		});

		let functionCalls;
		if (response.functionCalls && response.functionCalls.length > 0) {
			functionCalls = response.functionCalls.map(c => ({
				name: c.name ?? "",
				args: (c.args ?? {}) as Record<string, unknown>
			}));
		}

		return {
			text: response.text ?? undefined,
			usageMetadata: response.usageMetadata ? {
				promptTokenCount: response.usageMetadata.promptTokenCount ?? 0,
				candidatesTokenCount: response.usageMetadata.candidatesTokenCount ?? 0,
			} : undefined,
			functionCalls,
			rawContentToAppend: response.candidates?.[0]?.content,
		};
	}

	estimateCost(model: string, inputTokens: number, outputTokens: number): number {
		let inputPer1M: number;
		let outputPer1M: number;

		if (model.includes("pro")) {
			inputPer1M = 1.25;
			outputPer1M = 10.0;
		} else {
			// flash
			inputPer1M = 0.15;
			outputPer1M = 0.60;
		}

		return (inputTokens / 1_000_000) * inputPer1M + (outputTokens / 1_000_000) * outputPer1M;
	}
}

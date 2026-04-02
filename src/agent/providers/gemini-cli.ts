import {
	FunctionCallingConfigMode,
	GoogleGenAI,
	type Content,
	type Tool,
} from "@google/genai";
import type { LLMProvider, ProviderResponse } from "./types.ts";

/**
 * GeminiCliProvider leverages the official @google/genai SDK to provide high-limit 
 * agentic sessions with Google Search grounding and OAuth support.
 */
export class GeminiCliProvider implements LLMProvider {
	private client: GoogleGenAI;
	private options: { enableSearch?: boolean };

	constructor(apiKey?: string, options?: { enableSearch?: boolean }) {
		this.options = options || {};
		
		// If using OAuth/Device Flow, the official @google/genai SDK (v1+) 
		// can use Application Default Credentials (ADC) or a provided token.
		this.client = new GoogleGenAI({ 
			apiKey: apiKey || process.env.GOOGLE_API_KEY 
		});
	}

	async generateContent(
		model: string,
		contents: Content[],
		systemInstruction: string,
		tools: Tool[],
		options?: { responseMimeType?: string },
	): Promise<ProviderResponse> {
		const finalTools = [...(tools || [])];
		
		// Add Google Search grounding if enabled
		if (this.options.enableSearch) {
			finalTools.push({
				// @ts-ignore - googleSearchRetrieval is standard in v1/v1beta
				google_search_retrieval: {
					dynamic_retrieval_config: {
						mode: "MODE_DYNAMIC",
						dynamic_threshold: 0.3,
					},
				},
			} as any);
		}

		// Use the official model.generateContent API
		const response = await this.client.models.generateContent({
			model: model.replace('google/', ''), // SDK expects 'gemini-2.0-flash'
			contents,
			config: {
				systemInstruction,
				tools: finalTools,
				toolConfig: { 
					functionCallingConfig: { 
						mode: FunctionCallingConfigMode.AUTO 
					} 
				},
				responseMimeType: options?.responseMimeType,
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
		// If using OAuth Account Login, the cost is covered by a subscription 
		// (Google One / GCA) - so we report 0 to avoid confusing the user.
		if (!process.env.GOOGLE_API_KEY) {
			return 0;
		}

		let inputPer1M = 0.15;
		let outputPer1M = 0.60;
		if (model.includes("pro")) {
			inputPer1M = 1.25;
			outputPer1M = 10.0;
		}
		
		return (inputTokens / 1_000_000) * inputPer1M + (outputTokens / 1_000_000) * outputPer1M;
	}
}

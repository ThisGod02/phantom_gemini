import type { Content, Tool } from "@google/genai";

export interface ProviderUsageMetadata {
	promptTokenCount: number;
	candidatesTokenCount: number;
}

export interface ProviderFunctionCall {
	name: string;
	args: Record<string, unknown>;
}

export interface ProviderResponse {
	text?: string;
	usageMetadata?: ProviderUsageMetadata;
	functionCalls?: ProviderFunctionCall[];
	/** Raw content object returned by the model for conversation history */
	rawContentToAppend?: Content;
}

export interface LLMProvider {
	generateContent(
		model: string,
		contents: Content[],
		systemInstruction: string,
		tools: Tool[],
	): Promise<ProviderResponse>;

	estimateCost(model: string, inputTokens: number, outputTokens: number): number;
}

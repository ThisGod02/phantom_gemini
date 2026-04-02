import type { LLMProvider } from "./types.ts";
import { GeminiProvider } from "./gemini.ts";
import { OpenAIProvider } from "./openai.ts";

export function createProvider(providerType: string, apiKey?: string, baseUrl?: string): LLMProvider {
	if (providerType === "openai") {
		if (!apiKey) throw new Error("OpenAI-compatible provider requires an API key.");
		return new OpenAIProvider(baseUrl || "https://routerai.ru/api/v1", apiKey);
	}
	
	// Default native google genai
	return new GeminiProvider(apiKey);
}

export type { LLMProvider, ProviderResponse, ProviderUsageMetadata, ProviderFunctionCall } from "./types.ts";

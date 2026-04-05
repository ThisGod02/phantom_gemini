import type { LLMProvider } from "./types.ts";
import { GeminiProvider } from "./gemini.ts";
import { OpenAIProvider } from "./openai.ts";
import { GeminiCliProvider } from "./gemini-cli.ts";
import { OllamaProvider } from "./ollama.ts";

export function createProvider(
	providerType: string, 
	apiKey?: string, 
	baseUrl?: string,
	options?: { enableSearch?: boolean }
): LLMProvider {
	if (providerType === "openai") {
		if (!apiKey) throw new Error("OpenAI-compatible provider requires an API key.");
		return new OpenAIProvider(baseUrl || "https://routerai.ru/api/v1", apiKey);
	}

	if (providerType === "gemini-cli") {
		return new GeminiCliProvider(apiKey, { 
			...options, 
			useAntigravity: process.env.PHANTOM_ANTIGRAVITY === 'true' 
		});
	}

	if (providerType === "ollama") {
		return new OllamaProvider(baseUrl);
	}

	// Default native google genai
	return new GeminiProvider(apiKey);
}

export type { LLMProvider, ProviderResponse, ProviderUsageMetadata, ProviderFunctionCall } from "./types.ts";

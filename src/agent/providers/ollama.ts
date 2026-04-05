import { OpenAIProvider } from "./openai.ts";

function normalizeBaseUrl(baseUrl?: string): string {
	const trimmed = (baseUrl ?? process.env.OLLAMA_CHAT_URL ?? process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/+$/, "");
	return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

export class OllamaProvider extends OpenAIProvider {
	constructor(baseUrl?: string) {
		super(normalizeBaseUrl(baseUrl), process.env.OLLAMA_API_KEY || "ollama");
	}

	estimateCost(_model: string, _inputTokens: number, _outputTokens: number): number {
		return 0;
	}
}

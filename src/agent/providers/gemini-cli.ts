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
 * 
 * When no GOOGLE_API_KEY is set, it reads the cached OAuth token from
 * ~/.gemini/oauth_creds.json (written by `bun run src/cli/main.ts login`) and
 * passes it via httpOptions.headers, exactly the same way the official
 * gemini-cli tool authenticates with the Generative Language API.
 */
export class GeminiCliProvider implements LLMProvider {
	private client: GoogleGenAI;
	private options: { enableSearch?: boolean };

	constructor(apiKey?: string, options?: { enableSearch?: boolean }) {
		this.options = options || {};
		
		const finalApiKey = apiKey || process.env.GOOGLE_API_KEY;
		let accessToken: string | undefined;

		// If no API key, try to load OAuth token from Gemini CLI config
		if (!finalApiKey) {
			try {
				const os = require('os');
				const fs = require('fs');
				const path = require('path');
				const homedir = os.homedir();
				const credsPath = path.join(homedir, '.gemini', 'oauth_creds.json');
				
				if (fs.existsSync(credsPath)) {
					const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
					if (creds.access_token) {
						accessToken = creds.access_token;
					}
				}
			} catch (e) {
				// Silent fail
			}
		}

		if (accessToken) {
			console.log(`[gemini-cli] OAuth session active (token detected)`);
			// This is exactly how the official gemini-cli tool passes its OAuth token:
			// via httpOptions.headers — no apiKey, no vertexai mode needed.
			this.client = new GoogleGenAI({
				apiKey: undefined,
				httpOptions: {
					headers: {
						'Authorization': `Bearer ${accessToken}`,
					}
				}
			} as any);
		} else {
			// Standard API key mode
			this.client = new GoogleGenAI({ apiKey: finalApiKey });
		}
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

		// Map model name and check for invalid versions
		let modelName = model.replace('google/', '');
		if (modelName.startsWith('gemini-3')) {
			console.warn(`[gemini-cli] WARNING: Model "${modelName}" is likely invalid. Defaulting to "gemini-2.0-flash" to avoid 404.`);
			modelName = "gemini-2.0-flash";
		}

		// Use the official model.generateContent API
		const response = await this.client.models.generateContent({
			model: modelName,
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

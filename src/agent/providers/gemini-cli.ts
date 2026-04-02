import {
	FunctionCallingConfigMode,
	type Content,
	type Tool,
} from "@google/genai";
import type { LLMProvider, ProviderResponse } from "./types.ts";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";

/**
 * GeminiCliProvider uses the Gemini REST API directly with a Bearer token.
 * 
 * The @google/genai Node SDK always injects its own NodeAuth/ADC credentials
 * which overrides any manually set headers. The only reliable way to use a
 * personal OAuth token is to make raw fetch() calls to the REST API directly.
 * 
 * When no GOOGLE_API_KEY is set, it reads the cached OAuth token from
 * ~/.gemini/oauth_creds.json (written by `bun run src/cli/main.ts login`).
 */
export class GeminiCliProvider implements LLMProvider {
	private apiKey?: string;
	private accessToken?: string;
	private options: { enableSearch?: boolean };

	constructor(apiKey?: string, options?: { enableSearch?: boolean }) {
		this.options = options || {};
		this.apiKey = apiKey || process.env.GOOGLE_API_KEY;

		// If no API key, try to load OAuth token from Gemini CLI config
		if (!this.apiKey) {
			try {
				const os = require('os');
				const fs = require('fs');
				const path = require('path');
				const homedir = os.homedir();
				const credsPath = path.join(homedir, '.gemini', 'oauth_creds.json');
				
				if (fs.existsSync(credsPath)) {
					const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
					if (creds.access_token) {
						this.accessToken = creds.access_token;
						console.log(`[gemini-cli] OAuth session active (token detected)`);
					}
				}
			} catch (e) {
				// Silent fail
			}
		}
	}

	private getAuthHeaders(): Record<string, string> {
		if (this.accessToken) {
			return { 'Authorization': `Bearer ${this.accessToken}` };
		}
		return {};
	}

	private getApiVersionAndUrl(model: string): { url: string; apiVersion: string } {
		const apiVersion = "v1beta";
		const url = `${GEMINI_API_BASE}/${apiVersion}/models/${model}:generateContent`;
		return { url, apiVersion };
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
				googleSearchRetrieval: {
					dynamicRetrievalConfig: {
						mode: "MODE_DYNAMIC",
						dynamicThreshold: 0.3,
					},
				},
			} as any);
		}

		// Map model name and check for invalid versions
		let modelName = model.replace('google/', '');
		if (modelName.startsWith('gemini-3')) {
			console.warn(`[gemini-cli] WARNING: Model "${modelName}" is likely invalid. Defaulting to "gemini-2.0-flash".`);
			modelName = "gemini-2.0-flash";
		}

		const { url } = this.getApiVersionAndUrl(modelName);

		// Build request body (REST API format)
		const requestBody: any = {
			contents,
			generationConfig: {
				...(options?.responseMimeType && { responseMimeType: options.responseMimeType }),
			},
			tools: finalTools.length > 0 ? finalTools : undefined,
			toolConfig: finalTools.length > 0 ? {
				functionCallingConfig: { mode: "AUTO" }
			} : undefined,
		};

		if (systemInstruction) {
			requestBody.systemInstruction = { parts: [{ text: systemInstruction }] };
		}

		// Build headers
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			...this.getAuthHeaders(),
		};

		// If using API key (not OAuth), append it as query param (standard way)
		const requestUrl = this.apiKey
			? `${url}?key=${this.apiKey}`
			: url;

		const res = await fetch(requestUrl, {
			method: 'POST',
			headers,
			body: JSON.stringify(requestBody),
		});

		if (!res.ok) {
			const errorText = await res.text();
			throw new Error(errorText);
		}

		const data = await res.json() as any;

		// Parse response
		const candidate = data.candidates?.[0];
		const content = candidate?.content;
		const parts = content?.parts || [];

		let text: string | undefined;
		let functionCalls: Array<{ name: string; args: Record<string, unknown> }> | undefined;

		for (const part of parts) {
			if (part.text) {
				text = (text || '') + part.text;
			}
			if (part.functionCall) {
				if (!functionCalls) functionCalls = [];
				functionCalls.push({
					name: part.functionCall.name ?? "",
					args: (part.functionCall.args ?? {}) as Record<string, unknown>,
				});
			}
		}

		const usageMeta = data.usageMetadata;

		return {
			text,
			usageMetadata: usageMeta ? {
				promptTokenCount: usageMeta.promptTokenCount ?? 0,
				candidatesTokenCount: usageMeta.candidatesTokenCount ?? 0,
			} : undefined,
			functionCalls,
			rawContentToAppend: content,
		};
	}

	estimateCost(model: string, inputTokens: number, outputTokens: number): number {
		// If using OAuth Account Login, the cost is covered by a subscription 
		// (Google One / GCA) - so we report 0 to avoid confusing the user.
		if (!this.apiKey) {
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

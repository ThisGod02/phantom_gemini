import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
	type Content,
	type Tool,
} from "@google/genai";
import type { LLMProvider, ProviderResponse } from "./types.ts";

/**
 * GeminiCliProvider — uses the Cloud Code Assist API (cloudcode-pa.googleapis.com)
 * with personal Google OAuth credentials.
 *
 * This endpoint accepts the standard `cloud-platform` OAuth scope that
 * `gemini-cli login` produces, unlike generativelanguage.googleapis.com which
 * requires the `generative-language` scope.
 *
 * Auth flow:
 *   1. User runs: bun run src/cli/main.ts login
 *   2. We store tokens at ~/.phantom/oauth.json
 *   3. On each request, refresh the token if expired, then call CCA.
 *
 * Inspired by https://github.com/nghyane/ampcode-connector (MIT License)
 */

const CODE_ASSIST_ENDPOINT = "https://cloudcode-pa.googleapis.com";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

// Default internal project ID for personal accounts (from ampcode-connector/gemini-cli)
const DEFAULT_PROJECT_ID = "rising-fact-p41fc";

// OAuth client — set via env vars (see .env.example)
const OAUTH_CLIENT_ID = process.env.PHANTOM_GOOGLE_CLIENT_ID ?? "";
const OAUTH_CLIENT_SECRET = process.env.PHANTOM_GOOGLE_CLIENT_SECRET ?? "";

interface StoredTokens {
	access_token: string;
	refresh_token: string;
	expires_at: number; // unix ms
	email?: string;
	project_id?: string;
}

function getTokensPath(): string {
	return path.join(os.homedir(), '.phantom', 'oauth.json');
}

function loadTokens(): StoredTokens | null {
	try {
		const p = getTokensPath();
		if (!fs.existsSync(p)) return null;
		return JSON.parse(fs.readFileSync(p, 'utf8')) as StoredTokens;
	} catch {
		return null;
	}
}

function saveTokens(tokens: StoredTokens): void {
	try {
		const dir = path.dirname(getTokensPath());
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
		fs.writeFileSync(getTokensPath(), JSON.stringify(tokens, null, 2), { mode: 0o600 });
	} catch (e) {
		console.error('[gemini-cli] Failed to save tokens:', e);
	}
}

async function refreshAccessToken(refreshToken: string): Promise<StoredTokens | null> {
	const res = await fetch(GOOGLE_TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: OAUTH_CLIENT_ID,
			client_secret: OAUTH_CLIENT_SECRET,
			refresh_token: refreshToken,
			grant_type: 'refresh_token',
		}),
	});
	if (!res.ok) {
		console.error('[gemini-cli] Token refresh failed:', await res.text());
		return null;
	}
	const data = await res.json() as { access_token: string; expires_in: number };
	return {
		access_token: data.access_token,
		refresh_token: refreshToken,
		expires_at: Date.now() + (data.expires_in - 60) * 1000,
	};
}

async function getValidAccessToken(): Promise<string | null> {
	let tokens = loadTokens();
	if (!tokens) return null;

	// Refresh if expired or about to expire (within 5 minutes)
	if (Date.now() >= tokens.expires_at - 5 * 60 * 1000) {
		const refreshed = await refreshAccessToken(tokens.refresh_token);
		if (!refreshed) return null;
		tokens = { ...tokens, ...refreshed };
		saveTokens(tokens);
	}

	return tokens.access_token;
}

function buildCCAUrl(action: string): string {
	return `${CODE_ASSIST_ENDPOINT}/v1internal:${action}`;
}

function wrapForCCA(body: Record<string, unknown>, model: string, projectId: string): string {
	const requestId = `pi-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
	return JSON.stringify({
		project: projectId,
		model,
		request: body,
		userAgent: "pi-coding-agent",
		requestId,
	});
}

export class GeminiCliProvider implements LLMProvider {
	private options: { enableSearch?: boolean };
	private projectId: string;

	constructor(_apiKey?: string, options?: { enableSearch?: boolean }) {
		this.options = options || {};
		const tokens = loadTokens();
		this.projectId = tokens?.project_id || DEFAULT_PROJECT_ID;
	}

	async generateContent(
		model: string,
		contents: Content[],
		systemInstruction: string,
		tools: Tool[],
		options?: { responseMimeType?: string },
	): Promise<ProviderResponse> {
		const accessToken = await getValidAccessToken();
		if (!accessToken) {
			throw new Error('No OAuth token available. Run: bun run src/cli/main.ts login');
		}

		const finalTools = [...(tools || [])];
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

		let modelName = model.replace('google/', '');
		if (modelName.startsWith('gemini-3') && !modelName.includes('preview')) {
			modelName = "gemini-2.0-flash";
		}

		// Standard Gemini API request body
		const requestBody: Record<string, unknown> = {
			contents,
			generationConfig: {
				...(options?.responseMimeType && { responseMimeType: options.responseMimeType }),
			},
			...(finalTools.length > 0 && {
				tools: finalTools,
				toolConfig: { functionCallingConfig: { mode: "AUTO" } },
			}),
			...(systemInstruction && {
				systemInstruction: { parts: [{ text: systemInstruction }] },
			}),
		};

		const url = buildCCAUrl("generateContent");
		const wrappedBody = wrapForCCA(requestBody, modelName, this.projectId);

		const res = await fetch(url, {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${accessToken}`,
				'Content-Type': 'application/json',
				'User-Agent': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
				'X-Goog-Api-Client': 'gl-node/22.17.0',
				'Client-Metadata': JSON.stringify({
					ideType: "IDE_UNSPECIFIED",
					platform: "PLATFORM_UNSPECIFIED",
					pluginType: "GEMINI",
				}),
			},
			body: wrappedBody,
		});

		if (!res.ok) {
			const errorText = await res.text();
			throw new Error(errorText);
		}

		// CCA wraps response in: { "response": { ...gemini api response... }, "traceId": "..." }
		const envelope = await res.json() as { response?: any };
		const data = envelope.response ?? envelope;

		const candidate = data.candidates?.[0];
		const parts = candidate?.content?.parts || [];

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
			rawContentToAppend: candidate?.content,
		};
	}

	estimateCost(_model: string, _inputTokens: number, _outputTokens: number): number {
		// OAuth/subscription-based — no per-token cost
		return 0;
	}
}

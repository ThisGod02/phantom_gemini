import { OpenAI } from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/index";
import type { Content, Tool } from "@google/genai";
import type { LLMProvider, ProviderResponse } from "./types.ts";

export class OpenAIProvider implements LLMProvider {
	private client: OpenAI;

	constructor(baseURL: string, apiKey: string) {
		this.client = new OpenAI({
			baseURL: baseURL || "https://routerai.ru/api/v1",
			apiKey,
		});
	}

	async generateContent(
		model: string,
		contents: Content[],
		systemInstruction: string,
		tools: Tool[],
		options?: { responseMimeType?: string },
	): Promise<ProviderResponse> {
		const messages: ChatCompletionMessageParam[] = [];

		if (systemInstruction) {
			messages.push({ role: "system", content: systemInstruction });
		}

		// Track generated IDs to map function calls to function responses
		const callIdMap = new Map<string, string>();
		let callIndex = 0;

		for (const content of contents) {
			const isModel = content.role === "model";
			
			// Check if this content contains function calls (from assistant)
			const functionCalls = content.parts?.filter((p) => p.functionCall);
			if (functionCalls && functionCalls.length > 0) {
				const tool_calls = functionCalls.map((p) => {
					const name = p.functionCall!.name || "unknown_function";
					const id = `call_${name}_${callIndex++}`;
					callIdMap.set(name, id);
					
					return {
						id,
						type: "function" as const,
						function: {
							name,
							arguments: JSON.stringify(p.functionCall!.args || {}),
						},
					};
				});

				const textPart = content.parts?.find((p) => p.text);
				messages.push({
					role: "assistant",
					content: textPart?.text || null,
					tool_calls,
				});
				continue;
			}

			// Check if this content contains function responses (from user)
			const functionResponses = content.parts?.filter((p) => p.functionResponse);
			if (functionResponses && functionResponses.length > 0) {
				for (const p of functionResponses) {
					const name = p.functionResponse!.name || "unknown_function";
					const id = callIdMap.get(name) || `call_${name}_fallback`;
					messages.push({
						role: "tool",
						tool_call_id: id,
						content: JSON.stringify(p.functionResponse!.response || {}),
					});
				}
				continue;
			}

			// Normal text message
			const textPart = content.parts?.find((p) => p.text);
			if (textPart) {
				if (isModel) {
					messages.push({ role: "assistant", content: textPart.text! });
				} else {
					messages.push({ role: "user", content: textPart.text! });
				}
			}
		}

		// Map tools to OpenAI format
		const openaiTools: ChatCompletionTool[] = [];
		if (tools && tools.length > 0) {
			for (const tool of tools) {
				if (tool.functionDeclarations) {
					for (const decl of tool.functionDeclarations) {
						if (!decl.name) continue;
						openaiTools.push({
							type: "function",
							function: {
								name: decl.name,
								description: decl.description,
								parameters: this.sanitizeSchema(decl.parameters) as Record<string, unknown>,
							},
						});
					}
				}
			}
		}

		const response = await this.client.chat.completions.create({
			model,
			messages,
			tools: openaiTools.length > 0 ? openaiTools : undefined,
			tool_choice: openaiTools.length > 0 ? "auto" : undefined,
			...(options?.responseMimeType === "application/json" ? { response_format: { type: "json_object" } } : {}),
		});

		const choice = response.choices[0];
		const message = choice.message;

		let parsedFunctionCalls;
		if (message.tool_calls && message.tool_calls.length > 0) {
			parsedFunctionCalls = message.tool_calls.map((tc: any) => ({
				name: tc.function.name,
				args: JSON.parse(tc.function.arguments || "{}"),
			}));
		}

		// Recreate Gemini Content object to append to history
		const parts: any[] = [];
		if (message.content) {
			parts.push({ text: message.content });
		}
		if (parsedFunctionCalls) {
			for (const fc of parsedFunctionCalls) {
				parts.push({ functionCall: { name: fc.name, args: fc.args } });
			}
		}

		return {
			text: message.content ?? undefined,
			usageMetadata: response.usage ? {
				promptTokenCount: response.usage.prompt_tokens,
				candidatesTokenCount: response.usage.completion_tokens,
			} : undefined,
			functionCalls: parsedFunctionCalls,
			rawContentToAppend: {
				role: "model",
				parts,
			},
		};
	}

	estimateCost(model: string, inputTokens: number, outputTokens: number): number {
		let inputPer1M = 0;
		let outputPer1M = 0;

		const lowerModel = model.toLowerCase();
		if (lowerModel.includes("gemini-1.5-flash") || lowerModel.includes("gemini-3-flash")) {
			inputPer1M = 0.075;
			outputPer1M = 0.30;
		} else if (lowerModel.includes("gemini-1.5-pro") || lowerModel.includes("gemini-3-pro")) {
			inputPer1M = 1.25;
			outputPer1M = 5.00;
		} else if (lowerModel.includes("gemini-2.0-flash") || lowerModel.includes("gemini-2.5-flash")) {
			inputPer1M = 0.10;
			outputPer1M = 0.40;
		} else if (lowerModel.includes("gpt-4o-mini")) {
			inputPer1M = 0.15;
			outputPer1M = 0.60;
		} else {
			inputPer1M = 0.50;
			outputPer1M = 1.00;
		}

		return (inputTokens / 1_000_000) * inputPer1M + (outputTokens / 1_000_000) * outputPer1M;
	}

	private sanitizeSchema(schema: any): any {
		if (!schema || typeof schema !== "object") return schema;

		const result = { ...schema };

		// Ensure properties implies type: object (Gemini Requirement)
		if (result.properties && !result.type) {
			result.type = "object";
		}

		// Convert enum types (if numeric) or ensure string literals
		if (result.type) {
			const typeMap: Record<string | number, string> = {
				0: "string",
				1: "number",
				2: "integer",
				3: "boolean",
				4: "array",
				5: "object",
				STRING: "string",
				NUMBER: "number",
				INTEGER: "integer",
				BOOLEAN: "boolean",
				ARRAY: "array",
				OBJECT: "object",
			};
			if (typeMap[result.type]) {
				result.type = typeMap[result.type];
			} else {
				result.type = String(result.type).toLowerCase();
			}
		}

		// Recursively sanitize nested structures
		if (result.properties) {
			const newProps: Record<string, any> = {};
			for (const [key, prop] of Object.entries(result.properties)) {
				newProps[key] = this.sanitizeSchema(prop);
			}
			result.properties = newProps;
		}

		if (result.items) {
			result.items = this.sanitizeSchema(result.items);
		}

		return result;
	}
}

import type { Database } from "bun:sqlite";
import type { FunctionDeclaration } from "@google/genai";
import { Type } from "@google/genai";
import { createSecretRequest, getSecret } from "./store.ts";

type SecretToolDeps = {
	db: Database;
	baseUrl: string;
};

export const secretsDeclarations: FunctionDeclaration[] = [
	{
		name: "phantom_collect_secrets",
		description:
			"Create a secure form to collect credentials from the user. " +
			"Returns a magic-link URL to send to the user via Slack. " +
			"The user fills in the form and secrets are encrypted and stored. " +
			"After the user confirms they saved credentials, retrieve them with phantom_get_secret. " +
			"Always check phantom_get_secret first to avoid re-asking.",
		parameters: {
			type: Type.OBJECT,
			properties: {
				purpose: { type: Type.STRING, description: "Why you need these credentials. Shown to the user." },
				fields: {
					type: Type.STRING,
					description:
						'JSON array of field definitions. Each field: { name, label, description?, type: "password"|"text", required?: boolean, placeholder? }',
				},
				notify_channel_id: { type: Type.STRING, description: "Slack channel ID where conversation is happening" },
				notify_thread: { type: Type.STRING, description: "Slack thread timestamp" },
			},
			required: ["purpose", "fields"],
		},
	},
	{
		name: "phantom_get_secret",
		description:
			"Retrieve a previously stored secret by name. Returns the decrypted value " +
			"or an error if not found. Always check for existing secrets before " +
			"calling phantom_collect_secrets to avoid re-asking the user.",
		parameters: {
			type: Type.OBJECT,
			properties: {
				name: { type: Type.STRING, description: "The secret name as specified when collecting. Example: 'gitlab_token'" },
			},
			required: ["name"],
		},
	},
];

export async function handleSecretsToolCall(
	toolName: string,
	args: Record<string, unknown>,
	deps: SecretToolDeps,
): Promise<unknown> {
	if (toolName === "phantom_collect_secrets") {
		const rawFields = typeof args.fields === "string" ? JSON.parse(args.fields) : args.fields;
		const fields = (rawFields as { name: string; label: string; description?: string; type?: string; required?: boolean; placeholder?: string }[]).map(
			(f) => ({
				name: f.name,
				label: f.label,
				description: f.description,
				type: (f.type ?? "password") as "password" | "text",
				required: f.required ?? true,
				placeholder: f.placeholder,
				default: undefined,
			}),
		);

		const { requestId, magicToken } = createSecretRequest(
			deps.db,
			fields,
			args.purpose as string,
			"slack",
			(args.notify_channel_id as string) ?? null,
			(args.notify_thread as string) ?? null,
		);

		const url = `${deps.baseUrl}/ui/secrets/${requestId}?magic=${magicToken}`;
		return {
			request_id: requestId,
			url,
			expires_in: "10 minutes",
			field_count: fields.length,
			field_names: fields.map((f) => f.name),
			note: "Send this URL to the user via Slack. Do not wrap it in Markdown formatting.",
		};
	}

	if (toolName === "phantom_get_secret") {
		const name = args.name as string;
		const result = getSecret(deps.db, name);
		if (!result) {
			return {
				name,
				found: false,
				note: "No secret stored with this name. Use phantom_collect_secrets to request it from the user.",
			};
		}
		return { name, value: result.value, stored_at: result.storedAt };
	}

	throw new Error(`Unknown secrets tool: ${toolName}`);
}

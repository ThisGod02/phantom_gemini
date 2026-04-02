import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { FunctionDeclaration } from "@google/genai";
import { Type } from "@google/genai";
import { publish } from "./events.ts";
import { getPublicDir } from "./serve.ts";
import { createSession } from "./session.ts";

export const webUiDeclarations: FunctionDeclaration[] = [
	{
		name: "phantom_create_page",
		description:
			"Create or update an HTML page served at /ui/<path>. If html is provided, writes it directly. " +
			"If title and content are provided instead, wraps the content in the base template. " +
			"Returns the public URL of the page.",
		parameters: {
			type: Type.OBJECT,
			properties: {
				path: { type: Type.STRING, description: "File path relative to public/, e.g. 'dashboard.html'" },
				html: { type: Type.STRING, description: "Full HTML content to write (use this for complete pages)" },
				title: { type: Type.STRING, description: "Page title (used when wrapping content in base template)" },
				content: { type: Type.STRING, description: "HTML content for the <main> section (wrapped in base template)" },
			},
			required: ["path"],
		},
	},
	{
		name: "phantom_generate_login",
		description:
			"Generate a magic link for web UI authentication. Send this link to the user via Slack. " +
			"The link expires in 10 minutes. After authentication, the session lasts 7 days.",
		parameters: { type: Type.OBJECT, properties: {} },
	},
];

export async function handleWebUiToolCall(
	toolName: string,
	args: Record<string, unknown>,
	publicUrl: string | undefined,
): Promise<unknown> {
	const baseUrl = publicUrl ?? "";

	if (toolName === "phantom_create_page") {
		const path = args.path as string;
		const html = args.html as string | undefined;
		const title = args.title as string | undefined;
		const content = args.content as string | undefined;

		if (!html && !content) return { error: "Provide either 'html' (full page) or 'content' (to wrap in base template)" };

		const safePath = path.replace(/\.\./g, "").replace(/^\/+/, "");
		if (!safePath || safePath.includes("\0")) return { error: "Invalid path" };

		const fullPath = resolve(getPublicDir(), safePath);
		if (!fullPath.startsWith(getPublicDir())) return { error: "Path escapes public directory" };

		let htmlContent: string;
		if (html) {
			htmlContent = html;
		} else {
			htmlContent = wrapInBaseTemplate(title ?? "Phantom", content ?? "");
		}

		const dir = dirname(fullPath);
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
		await Bun.write(fullPath, htmlContent);

		publish("page_updated", { path: `/ui/${safePath}` });

		const pageUrl = baseUrl ? `${baseUrl}/ui/${safePath}` : `/ui/${safePath}`;
		return { created: true, path: safePath, url: pageUrl, size: htmlContent.length };
	}

	if (toolName === "phantom_generate_login") {
		const { magicToken } = createSession();
		const loginUrl = baseUrl ? `${baseUrl}/ui/login?magic=${magicToken}` : `/ui/login?magic=${magicToken}`;
		return {
			magicLink: loginUrl,
			expiresIn: "10 minutes",
			sessionDuration: "7 days",
			note: "Send the magic link to the user via Slack. They click it and are authenticated instantly.",
		};
	}

	throw new Error(`Unknown web UI tool: ${toolName}`);
}

function wrapInBaseTemplate(title: string, content: string): string {
	const now = new Date();
	const date = now.toISOString().split("T")[0];
	const timestamp = now.toISOString();
	const baseTemplatePath = resolve(getPublicDir(), "_base.html");
	try {
		const template = readFileSync(baseTemplatePath, "utf-8");
		return template
			.replace(/\{\{TITLE\}\}/g, escapeHtml(title))
			.replace(/\{\{DATE\}\}/g, date)
			.replace(/\{\{TIMESTAMP\}\}/g, timestamp)
			.replace("<!-- Agent writes content here -->", content);
	} catch {
		return `<!DOCTYPE html><html><head><title>${escapeHtml(title)}</title></head><body>${content}</body></html>`;
	}
}

function escapeHtml(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

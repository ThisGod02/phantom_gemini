import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { MemoryConfigSchema } from "../config/schemas.ts";
import type { MemoryConfig } from "../config/types.ts";

const DEFAULT_CONFIG_PATH = "config/memory.yaml";

/**
 * Apply environment variable overrides for Docker and bare-metal compatibility.
 * QDRANT_URL, OLLAMA_URL, and EMBEDDING_MODEL env vars take precedence over YAML config.
 */
function applyEnvOverrides(config: MemoryConfig): MemoryConfig {
	const qdrantUrl = process.env.QDRANT_URL;
	const ollamaUrl = process.env.OLLAMA_URL;
	const embeddingModel = process.env.EMBEDDING_MODEL;

	return {
		...config,
		qdrant: {
			...config.qdrant,
			...(qdrantUrl ? { url: qdrantUrl } : {}),
		},
		ollama: {
			...config.ollama,
			...(ollamaUrl ? { url: ollamaUrl } : {}),
			...(embeddingModel ? { model: embeddingModel } : {}),
		},
	};
}

export function loadMemoryConfig(path?: string): MemoryConfig {
	const configPath = path ?? DEFAULT_CONFIG_PATH;

	let text: string;
	try {
		text = readFileSync(configPath, "utf-8");
	} catch {
		console.warn(
			`[memory] Config file not found at ${configPath}. Using defaults. Create config/memory.yaml to customize.`,
		);
		return applyEnvOverrides(MemoryConfigSchema.parse({}));
	}

	const parsed: unknown = parse(text);
	const result = MemoryConfigSchema.safeParse(parsed);

	if (!result.success) {
		const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
		console.warn(`[memory] Invalid config at ${configPath}:\n${issues}\nUsing defaults.`);
		return applyEnvOverrides(MemoryConfigSchema.parse({}));
	}

	return applyEnvOverrides(result.data);
}

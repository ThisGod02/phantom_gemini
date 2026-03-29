import type { MemoryConfig } from "../config/types.ts";
import type { SparseVector } from "./types.ts";

export class EmbeddingClient {
	private baseUrl: string;
	private model: string;

	constructor(config: MemoryConfig) {
		this.baseUrl = config.ollama.url;
		this.model = config.ollama.model;
	}

	async embed(text: string): Promise<number[]> {
		const response = await fetch(`${this.baseUrl}/api/embed`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ model: this.model, input: text }),
		});

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(
				`Ollama embedding failed (${response.status}): ${body || response.statusText}. ` +
					`Is Ollama running at ${this.baseUrl} with model "${this.model}" pulled?`,
			);
		}

		const data = (await response.json()) as { embeddings: number[][] };

		if (!data.embeddings?.[0]) {
			throw new Error("Ollama returned empty embeddings. Check that the model is loaded.");
		}

		return data.embeddings[0];
	}

	async embedBatch(texts: string[]): Promise<number[][]> {
		const response = await fetch(`${this.baseUrl}/api/embed`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ model: this.model, input: texts }),
		});

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(`Ollama batch embedding failed (${response.status}): ${body || response.statusText}`);
		}

		const data = (await response.json()) as { embeddings: number[][] };

		if (!data.embeddings || data.embeddings.length !== texts.length) {
			throw new Error(`Ollama returned ${data.embeddings?.length ?? 0} embeddings for ${texts.length} inputs`);
		}

		return data.embeddings;
	}

	async isHealthy(): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/api/tags`, {
				signal: AbortSignal.timeout(3000),
			});
			return response.ok;
		} catch {
			return false;
		}
	}
}

/**
 * Generate a BM25-style sparse vector from text.
 * Tokenizes on word boundaries, computes term frequencies,
 * and maps tokens to stable integer indices via a simple hash.
 */
export function textToSparseVector(text: string): SparseVector {
	const tokens = text
		.toLowerCase()
		.replace(/[^\w\s]/g, " ")
		.split(/\s+/)
		.filter((t) => t.length > 1);

	if (tokens.length === 0) {
		return { indices: [], values: [] };
	}

	const tf = new Map<string, number>();
	for (const token of tokens) {
		tf.set(token, (tf.get(token) ?? 0) + 1);
	}

	const indices: number[] = [];
	const values: number[] = [];

	for (const [token, count] of tf.entries()) {
		indices.push(stableHash(token));
		values.push(count / tokens.length);
	}

	return { indices, values };
}

/**
 * Stable hash for token to sparse vector index mapping.
 * Uses FNV-1a to produce a positive 32-bit integer.
 */
function stableHash(str: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash = (hash * 0x01000193) >>> 0;
	}
	return hash >>> 0;
}

import { afterAll, describe, expect, mock, test } from "bun:test";
import type { MemoryConfig } from "../../config/types.ts";
import { EmbeddingClient } from "../embeddings.ts";
import { EpisodicStore } from "../episodic.ts";
import { QdrantClient } from "../qdrant-client.ts";
import type { Episode } from "../types.ts";

const TEST_CONFIG: MemoryConfig = {
	qdrant: { url: "http://localhost:6333" },
	ollama: { url: "http://localhost:11434", model: "nomic-embed-text" },
	collections: { episodes: "episodes", semantic_facts: "semantic_facts", procedures: "procedures" },
	embedding: { dimensions: 768, batch_size: 32 },
	context: { max_tokens: 50000, episode_limit: 10, fact_limit: 20, procedure_limit: 5 },
};

function makeTestEpisode(overrides?: Partial<Episode>): Episode {
	return {
		id: "ep-001",
		type: "task",
		summary: "Deployed the staging server",
		detail: "User asked to deploy staging. Ran tests, created PR, merged.",
		parent_id: null,
		session_id: "session-1",
		user_id: "user-1",
		tools_used: ["Bash", "Write"],
		files_touched: ["/deploy.sh"],
		outcome: "success",
		outcome_detail: "Deployment completed successfully",
		lessons: ["Always run tests before deploying"],
		started_at: new Date(Date.now() - 3600000).toISOString(),
		ended_at: new Date().toISOString(),
		duration_seconds: 3600,
		importance: 0.8,
		access_count: 0,
		last_accessed_at: new Date().toISOString(),
		decay_rate: 1.0,
		...overrides,
	};
}

function make768dVector(): number[] {
	return Array.from({ length: 768 }, (_, i) => Math.sin(i * 0.01));
}

describe("EpisodicStore", () => {
	const originalFetch = globalThis.fetch;

	afterAll(() => {
		globalThis.fetch = originalFetch;
	});

	test("store() embeds summary and detail, upserts to Qdrant", async () => {
		const vec = make768dVector();
		let upsertCalled = false;
		let upsertBody: Record<string, unknown> | null = null;

		globalThis.fetch = mock((url: string | Request, init?: RequestInit) => {
			const urlStr = typeof url === "string" ? url : url.url;

			// Ollama embed
			if (urlStr.includes("/api/embed")) {
				return Promise.resolve(
					new Response(JSON.stringify({ embeddings: [vec, vec] }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					}),
				);
			}

			// Qdrant collection check
			if (urlStr.includes("/collections/episodes") && (!init?.method || init?.method === "GET")) {
				return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
			}

			// Qdrant upsert
			if (urlStr.includes("/points") && init?.method === "PUT") {
				upsertCalled = true;
				upsertBody = JSON.parse(init.body as string);
				return Promise.resolve(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
			}

			// Qdrant payload index
			if (urlStr.includes("/index")) {
				return Promise.resolve(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
			}

			return Promise.resolve(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
		}) as unknown as typeof fetch;

		const qdrant = new QdrantClient(TEST_CONFIG);
		const embedder = new EmbeddingClient(TEST_CONFIG);
		const store = new EpisodicStore(qdrant, embedder, TEST_CONFIG);

		const episode = makeTestEpisode();
		const id = await store.store(episode);

		expect(id).toBe("ep-001");
		expect(upsertCalled).toBe(true);

		const body = upsertBody as unknown as Record<string, unknown>;
		const points = body.points as Array<Record<string, unknown>>;
		expect(points.length).toBe(1);
		expect(points[0].id).toBe("ep-001");

		const payload = points[0].payload as Record<string, unknown>;
		expect(payload.type).toBe("task");
		expect(payload.outcome).toBe("success");
		expect(payload.session_id).toBe("session-1");
	});

	test("recall() searches Qdrant and returns episodes", async () => {
		const vec = make768dVector();
		const now = Date.now();

		globalThis.fetch = mock((url: string | Request, _init?: RequestInit) => {
			const urlStr = typeof url === "string" ? url : url.url;

			// Ollama embed (for query)
			if (urlStr.includes("/api/embed")) {
				return Promise.resolve(
					new Response(JSON.stringify({ embeddings: [vec] }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					}),
				);
			}

			// Qdrant query
			if (urlStr.includes("/points/query")) {
				return Promise.resolve(
					new Response(
						JSON.stringify({
							result: {
								points: [
									{
										id: "ep-001",
										score: 0.9,
										payload: {
											type: "task",
											summary: "Deployed the staging server",
											detail: "Full detail here",
											session_id: "session-1",
											user_id: "user-1",
											outcome: "success",
											importance: 0.8,
											started_at: now - 3600000,
											ended_at: now,
											tools_used: ["Bash"],
											files_touched: ["/deploy.sh"],
											lessons: ["test first"],
											access_count: 2,
										},
									},
								],
							},
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					),
				);
			}

			// Qdrant payload update (access count)
			return Promise.resolve(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
		}) as unknown as typeof fetch;

		const qdrant = new QdrantClient(TEST_CONFIG);
		const embedder = new EmbeddingClient(TEST_CONFIG);
		const store = new EpisodicStore(qdrant, embedder, TEST_CONFIG);

		const episodes = await store.recall("What happened with the staging deployment?");

		expect(episodes.length).toBe(1);
		expect(episodes[0].id).toBe("ep-001");
		expect(episodes[0].summary).toBe("Deployed the staging server");
		expect(episodes[0].outcome).toBe("success");
	});

	test("recall() applies recency-biased scoring by default", async () => {
		const vec = make768dVector();
		const now = Date.now();

		globalThis.fetch = mock((url: string | Request) => {
			const urlStr = typeof url === "string" ? url : url.url;

			if (urlStr.includes("/api/embed")) {
				return Promise.resolve(new Response(JSON.stringify({ embeddings: [vec] }), { status: 200 }));
			}

			if (urlStr.includes("/points/query")) {
				return Promise.resolve(
					new Response(
						JSON.stringify({
							result: {
								points: [
									{
										id: "old-ep",
										score: 0.95,
										payload: {
											type: "task",
											summary: "Old high-score episode",
											importance: 0.3,
											started_at: now - 30 * 24 * 3600 * 1000, // 30 days ago
										},
									},
									{
										id: "new-ep",
										score: 0.7,
										payload: {
											type: "task",
											summary: "Recent lower-score episode",
											importance: 0.7,
											started_at: now - 3600000, // 1 hour ago
										},
									},
								],
							},
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					),
				);
			}

			return Promise.resolve(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
		}) as unknown as typeof fetch;

		const qdrant = new QdrantClient(TEST_CONFIG);
		const embedder = new EmbeddingClient(TEST_CONFIG);
		const store = new EpisodicStore(qdrant, embedder, TEST_CONFIG);

		const episodes = await store.recall("test query");

		// With recency-biased scoring, the recent episode should rank higher
		// despite having a lower raw search score
		expect(episodes[0].id).toBe("new-ep");
		expect(episodes[1].id).toBe("old-ep");
	});
});

import { describe, expect, test } from "bun:test";
import { RateLimiter } from "../rate-limiter.ts";

describe("RateLimiter", () => {
	test("allows requests under the limit", () => {
		const limiter = new RateLimiter({ requests_per_minute: 60, burst: 10 });
		const result = limiter.check("client-a");
		expect(result.allowed).toBe(true);
		if (result.allowed) {
			expect(result.remaining).toBeGreaterThanOrEqual(0);
		}
	});

	test("allows burst requests", () => {
		const limiter = new RateLimiter({ requests_per_minute: 10, burst: 5 });

		// Should allow up to maxTokens (10 + 5 = 15 tokens initially)
		for (let i = 0; i < 15; i++) {
			const result = limiter.check("client-burst");
			expect(result.allowed).toBe(true);
		}
	});

	test("blocks after exceeding rate", () => {
		const limiter = new RateLimiter({ requests_per_minute: 5, burst: 0 });

		// Drain all 5 tokens
		for (let i = 0; i < 5; i++) {
			limiter.check("client-flood");
		}

		const blocked = limiter.check("client-flood");
		expect(blocked.allowed).toBe(false);
		if (!blocked.allowed) {
			expect(blocked.retryAfter).toBeGreaterThan(0);
		}
	});

	test("tracks separate buckets per client", () => {
		const limiter = new RateLimiter({ requests_per_minute: 2, burst: 0 });

		// Drain client-a
		limiter.check("client-a");
		limiter.check("client-a");
		const blockedA = limiter.check("client-a");
		expect(blockedA.allowed).toBe(false);

		// client-b should still be fine
		const resultB = limiter.check("client-b");
		expect(resultB.allowed).toBe(true);
	});

	test("cleanup removes stale buckets", () => {
		const limiter = new RateLimiter({ requests_per_minute: 60, burst: 10 });
		limiter.check("stale-client");

		// Cleanup with 0ms age should remove everything
		limiter.cleanup(0);

		// Next request should create a fresh bucket
		const result = limiter.check("stale-client");
		expect(result.allowed).toBe(true);
	});
});

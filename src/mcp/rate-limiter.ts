import type { RateLimitConfig } from "./types.ts";

type Bucket = {
	tokens: number;
	lastRefill: number;
};

export class RateLimiter {
	private buckets = new Map<string, Bucket>();
	private maxTokens: number;
	private refillRate: number;

	constructor(config: RateLimitConfig) {
		this.maxTokens = config.requests_per_minute + config.burst;
		this.refillRate = config.requests_per_minute / 60;
	}

	check(clientName: string): RateLimitResult {
		const now = Date.now();
		let bucket = this.buckets.get(clientName);

		if (!bucket) {
			bucket = { tokens: this.maxTokens, lastRefill: now };
			this.buckets.set(clientName, bucket);
		}

		// Refill tokens based on elapsed time
		const elapsed = (now - bucket.lastRefill) / 1000;
		bucket.tokens = Math.min(this.maxTokens, bucket.tokens + elapsed * this.refillRate);
		bucket.lastRefill = now;

		if (bucket.tokens < 1) {
			const retryAfter = Math.ceil((1 - bucket.tokens) / this.refillRate);
			return { allowed: false, retryAfter };
		}

		bucket.tokens -= 1;
		return { allowed: true, remaining: Math.floor(bucket.tokens) };
	}

	// Clean up stale buckets (call periodically)
	cleanup(maxAgeMs = 300_000): void {
		const now = Date.now();
		for (const [key, bucket] of this.buckets) {
			if (now - bucket.lastRefill > maxAgeMs) {
				this.buckets.delete(key);
			}
		}
	}
}

export type RateLimitResult = { allowed: true; remaining: number } | { allowed: false; retryAfter: number };

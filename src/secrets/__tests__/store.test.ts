import type { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createTestDatabase } from "../../db/connection.ts";
import { MIGRATIONS } from "../../db/schema.ts";
import { resetKeyCache } from "../crypto.ts";
import { createSecretRequest, getSecret, getSecretRequest, saveSecrets, validateMagicToken } from "../store.ts";

let db: Database;

beforeEach(() => {
	resetKeyCache();
	process.env.SECRET_ENCRYPTION_KEY = randomBytes(32).toString("hex");
	db = createTestDatabase();
	for (const migration of MIGRATIONS) {
		db.run(migration);
	}
});

afterEach(() => {
	resetKeyCache();
	process.env.SECRET_ENCRYPTION_KEY = undefined;
	db.close();
});

const testFields = [
	{ name: "gitlab_token", label: "GitLab Token", type: "password" as const, required: true },
	{ name: "gitlab_url", label: "GitLab URL", type: "text" as const, required: false, default: "https://gitlab.com" },
];

describe("createSecretRequest", () => {
	test("creates a request with a unique ID and magic token", () => {
		const { requestId, magicToken } = createSecretRequest(
			db,
			testFields,
			"Access GitLab",
			"slack",
			"C123",
			"1234.5678",
		);
		expect(requestId).toMatch(/^sec_[a-z0-9]+$/);
		expect(magicToken).toBeTruthy();
		expect(magicToken.length).toBeGreaterThan(20);
	});

	test("stores request in database", () => {
		const { requestId } = createSecretRequest(db, testFields, "Access GitLab", "slack", "C123", "1234.5678");
		const request = getSecretRequest(db, requestId);
		expect(request).not.toBeNull();
		expect(request?.purpose).toBe("Access GitLab");
		expect(request?.fields).toHaveLength(2);
		expect(request?.status).toBe("pending");
		expect(request?.notifyChannel).toBe("slack");
		expect(request?.notifyChannelId).toBe("C123");
		expect(request?.notifyThread).toBe("1234.5678");
	});

	test("sets expiration to 10 minutes from creation", () => {
		const before = Date.now();
		const { requestId } = createSecretRequest(db, testFields, "Test", null, null, null);
		const request = getSecretRequest(db, requestId);
		expect(request).not.toBeNull();
		if (!request) throw new Error("unreachable");
		const expiresMs = new Date(request.expiresAt).getTime();
		const expectedMs = before + 10 * 60 * 1000;
		expect(expiresMs).toBeGreaterThanOrEqual(expectedMs - 2000);
		expect(expiresMs).toBeLessThanOrEqual(expectedMs + 2000);
	});

	test("generates unique IDs for each request", () => {
		const a = createSecretRequest(db, testFields, "Test A", null, null, null);
		const b = createSecretRequest(db, testFields, "Test B", null, null, null);
		expect(a.requestId).not.toBe(b.requestId);
		expect(a.magicToken).not.toBe(b.magicToken);
	});
});

describe("validateMagicToken", () => {
	test("returns true for valid token and pending request", () => {
		const { requestId, magicToken } = createSecretRequest(db, testFields, "Test", null, null, null);
		expect(validateMagicToken(db, requestId, magicToken)).toBe(true);
	});

	test("returns false for wrong token", () => {
		const { requestId } = createSecretRequest(db, testFields, "Test", null, null, null);
		expect(validateMagicToken(db, requestId, "wrong-token")).toBe(false);
	});

	test("returns false for non-existent request", () => {
		expect(validateMagicToken(db, "sec_nonexistent", "token")).toBe(false);
	});

	test("returns false for completed request", () => {
		const { requestId, magicToken } = createSecretRequest(db, testFields, "Test", null, null, null);
		saveSecrets(db, requestId, { gitlab_token: "test-value" });
		expect(validateMagicToken(db, requestId, magicToken)).toBe(false);
	});
});

describe("saveSecrets", () => {
	test("encrypts and stores secrets", () => {
		const { requestId } = createSecretRequest(db, testFields, "Test", null, null, null);
		const { saved } = saveSecrets(db, requestId, { gitlab_token: "glpat-abc123", gitlab_url: "https://gitlab.com" });
		expect(saved).toContain("gitlab_token");
		expect(saved).toContain("gitlab_url");
	});

	test("marks request as completed", () => {
		const { requestId } = createSecretRequest(db, testFields, "Test", null, null, null);
		saveSecrets(db, requestId, { gitlab_token: "test" });
		const request = getSecretRequest(db, requestId);
		expect(request?.status).toBe("completed");
		expect(request?.completedAt).not.toBeNull();
	});

	test("skips empty values", () => {
		const { requestId } = createSecretRequest(db, testFields, "Test", null, null, null);
		const { saved } = saveSecrets(db, requestId, { gitlab_token: "abc", gitlab_url: "" });
		expect(saved).toEqual(["gitlab_token"]);
	});

	test("throws for non-existent request", () => {
		expect(() => saveSecrets(db, "sec_nonexistent", { x: "y" })).toThrow("Request not found");
	});

	test("throws for already completed request", () => {
		const { requestId } = createSecretRequest(db, testFields, "Test", null, null, null);
		saveSecrets(db, requestId, { gitlab_token: "first" });
		expect(() => saveSecrets(db, requestId, { gitlab_token: "second" })).toThrow("already completed");
	});

	test("overwrites existing secrets with same name via new request", () => {
		const req1 = createSecretRequest(db, testFields, "Test 1", null, null, null);
		saveSecrets(db, req1.requestId, { gitlab_token: "old-value" });

		const req2 = createSecretRequest(db, testFields, "Test 2", null, null, null);
		saveSecrets(db, req2.requestId, { gitlab_token: "new-value" });

		const result = getSecret(db, "gitlab_token");
		expect(result?.value).toBe("new-value");
	});
});

describe("getSecret", () => {
	test("retrieves and decrypts a stored secret", () => {
		const { requestId } = createSecretRequest(db, testFields, "Test", null, null, null);
		saveSecrets(db, requestId, { gitlab_token: "glpat-real-token-123" });

		const result = getSecret(db, "gitlab_token");
		expect(result).not.toBeNull();
		expect(result?.value).toBe("glpat-real-token-123");
	});

	test("returns null for non-existent secret", () => {
		expect(getSecret(db, "nonexistent")).toBeNull();
	});

	test("increments access count", () => {
		const { requestId } = createSecretRequest(db, testFields, "Test", null, null, null);
		saveSecrets(db, requestId, { gitlab_token: "test" });

		getSecret(db, "gitlab_token");
		getSecret(db, "gitlab_token");
		getSecret(db, "gitlab_token");

		const row = db.query("SELECT access_count FROM secrets WHERE name = 'gitlab_token'").get() as {
			access_count: number;
		};
		expect(row.access_count).toBe(3);
	});

	test("updates last_accessed_at", () => {
		const { requestId } = createSecretRequest(db, testFields, "Test", null, null, null);
		saveSecrets(db, requestId, { gitlab_token: "test" });

		getSecret(db, "gitlab_token");

		const row = db.query("SELECT last_accessed_at FROM secrets WHERE name = 'gitlab_token'").get() as {
			last_accessed_at: string;
		};
		expect(row.last_accessed_at).not.toBeNull();
	});
});

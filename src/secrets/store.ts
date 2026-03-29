import type { Database } from "bun:sqlite";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { decryptSecret, encryptSecret } from "./crypto.ts";

export type SecretField = {
	name: string;
	label: string;
	description?: string;
	type: "password" | "text";
	required: boolean;
	placeholder?: string;
	default?: string;
};

export type SecretRequest = {
	requestId: string;
	fields: SecretField[];
	purpose: string;
	notifyChannel: string | null;
	notifyChannelId: string | null;
	notifyThread: string | null;
	magicTokenHash: string;
	status: "pending" | "completed" | "expired";
	createdAt: string;
	expiresAt: string;
	completedAt: string | null;
};

type SecretRequestRow = {
	request_id: string;
	fields_json: string;
	purpose: string;
	notify_channel: string | null;
	notify_channel_id: string | null;
	notify_thread: string | null;
	magic_token_hash: string;
	status: string;
	created_at: string;
	expires_at: string;
	completed_at: string | null;
};

type SecretRow = {
	name: string;
	encrypted_value: string;
	iv: string;
	auth_tag: string;
	field_type: string;
	created_at: string;
	updated_at: string;
	last_accessed_at: string | null;
	access_count: number;
};

const MAGIC_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

export function createSecretRequest(
	db: Database,
	fields: SecretField[],
	purpose: string,
	notifyChannel: string | null,
	notifyChannelId: string | null,
	notifyThread: string | null,
): { requestId: string; magicToken: string } {
	const requestId = `sec_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
	const magicToken = randomBytes(24).toString("base64url");
	const magicTokenHash = hashToken(magicToken);
	const now = new Date();
	const expiresAt = new Date(now.getTime() + MAGIC_TOKEN_TTL_MS);

	db.run(
		`INSERT INTO secret_requests (request_id, fields_json, purpose, notify_channel, notify_channel_id, notify_thread, magic_token_hash, status, created_at, expires_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
		[
			requestId,
			JSON.stringify(fields),
			purpose,
			notifyChannel,
			notifyChannelId,
			notifyThread,
			magicTokenHash,
			now.toISOString(),
			expiresAt.toISOString(),
		],
	);

	return { requestId, magicToken };
}

export function getSecretRequest(db: Database, requestId: string): SecretRequest | null {
	const row = db.query("SELECT * FROM secret_requests WHERE request_id = ?").get(requestId) as SecretRequestRow | null;
	if (!row) return null;
	return rowToRequest(row);
}

export function validateMagicToken(db: Database, requestId: string, magicToken: string): boolean {
	const row = db
		.query("SELECT magic_token_hash, status, expires_at FROM secret_requests WHERE request_id = ?")
		.get(requestId) as { magic_token_hash: string; status: string; expires_at: string } | null;

	if (!row) return false;
	if (row.status !== "pending") return false;
	if (new Date(row.expires_at) < new Date()) return false;

	return row.magic_token_hash === hashToken(magicToken);
}

export function saveSecrets(db: Database, requestId: string, secrets: Record<string, string>): { saved: string[] } {
	const request = getSecretRequest(db, requestId);
	if (!request) throw new Error("Request not found");
	if (request.status !== "pending") throw new Error("Request already completed");
	if (new Date(request.expiresAt) < new Date()) throw new Error("Request expired");

	const saved: string[] = [];
	const fieldMap = new Map(request.fields.map((f) => [f.name, f]));

	for (const [name, value] of Object.entries(secrets)) {
		if (!value.trim()) continue;

		const field = fieldMap.get(name);
		const fieldType = field?.type ?? "password";
		const { encrypted, iv, authTag } = encryptSecret(value);

		db.run(
			`INSERT OR REPLACE INTO secrets (name, encrypted_value, iv, auth_tag, field_type, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
			[name, encrypted, iv, authTag, fieldType],
		);

		saved.push(name);
		console.log(`[secrets] Stored secret: ${name}`);
	}

	// Mark request as completed
	db.run("UPDATE secret_requests SET status = 'completed', completed_at = datetime('now') WHERE request_id = ?", [
		requestId,
	]);

	return { saved };
}

function rowToRequest(row: SecretRequestRow): SecretRequest {
	return {
		requestId: row.request_id,
		fields: JSON.parse(row.fields_json) as SecretField[],
		purpose: row.purpose,
		notifyChannel: row.notify_channel,
		notifyChannelId: row.notify_channel_id,
		notifyThread: row.notify_thread,
		magicTokenHash: row.magic_token_hash,
		status: row.status as SecretRequest["status"],
		createdAt: row.created_at,
		expiresAt: row.expires_at,
		completedAt: row.completed_at,
	};
}

export function getSecret(db: Database, name: string): { value: string; storedAt: string } | null {
	const row = db.query("SELECT * FROM secrets WHERE name = ?").get(name) as SecretRow | null;
	if (!row) return null;

	// Update access audit
	db.run("UPDATE secrets SET last_accessed_at = datetime('now'), access_count = access_count + 1 WHERE name = ?", [
		name,
	]);

	const value = decryptSecret(row.encrypted_value, row.iv, row.auth_tag);
	console.log(`[secrets] Retrieved secret: ${name}`);
	return { value, storedAt: row.created_at };
}

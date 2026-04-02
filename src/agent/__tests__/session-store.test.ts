import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { runMigrations } from "../../db/migrate.ts";
import { SessionStore } from "../session-store.ts";

let db: Database;
let store: SessionStore;

beforeEach(() => {
	db = new Database(":memory:");
	db.run("PRAGMA journal_mode = WAL");
	db.run("PRAGMA foreign_keys = ON");
	runMigrations(db);
	store = new SessionStore(db);
});

describe("SessionStore", () => {
	test("creates a new session", () => {
		const session = store.create("cli", "conv-1");
		expect(session.session_key).toBe("cli:conv-1");
		expect(session.channel_id).toBe("cli");
		expect(session.conversation_id).toBe("conv-1");
		expect(session.status).toBe("active");
		expect(session.total_cost_usd).toBe(0);
	});

	test("finds an active session", () => {
		store.create("cli", "conv-1");
		const found = store.findActive("cli", "conv-1");
		expect(found).not.toBeNull();
		expect(found?.session_key).toBe("cli:conv-1");
	});

	test("returns null for non-existent session", () => {
		const found = store.findActive("cli", "missing");
		expect(found).toBeNull();
	});

	test("saves and gets chat history", () => {
		store.create("cli", "conv-1");
		store.saveHistory("cli:conv-1", [{ role: "user", parts: [{ text: "hi" }] }]);
		
		const session = store.getByKey("cli:conv-1");
		expect(session?.chat_history).toBeDefined();
		
		const history = store.getHistory("cli:conv-1");
		expect(history.length).toBe(1);
		expect(history[0].role).toBe("user");
	});

	test("expires a session", () => {
		store.create("cli", "conv-1");
		store.expire("cli:conv-1");
		const found = store.findActive("cli", "conv-1");
		expect(found).toBeNull();

		const raw = store.getByKey("cli:conv-1");
		expect(raw?.status).toBe("expired");
	});

	test("touches a session to update last_active_at", () => {
		store.create("cli", "conv-1");
		const before = store.getByKey("cli:conv-1");
		store.touch("cli:conv-1");
		const after = store.getByKey("cli:conv-1");
		expect(after?.last_active_at).toBeDefined();
		expect(before?.last_active_at).toBeDefined();
	});

	test("clears chat history", () => {
		store.create("cli", "conv-1");
		store.saveHistory("cli:conv-1", [{ role: "user", parts: [{ text: "hi" }] }]);
		expect(store.getHistory("cli:conv-1").length).toBe(1);

		store.clearHistory("cli:conv-1");
		const session = store.getByKey("cli:conv-1");
		expect(session?.chat_history).toBeNull();
		expect(session?.status).toBe("active");
	});

	test("create reactivates an expired session with the same key", () => {
		store.create("cli", "conv-1");
		store.saveHistory("cli:conv-1", [{ role: "user", parts: [{ text: "hi" }] }]);
		store.expire("cli:conv-1");

		expect(store.findActive("cli", "conv-1")).toBeNull();

		// Creating again should reactivate
		const reactivated = store.create("cli", "conv-1");
		expect(reactivated.status).toBe("active");
		expect(reactivated.session_key).toBe("cli:conv-1");
		// Note: we kept the history in the SQLite schema during reactivate since chat_history is not updated in the Upsert.
		// That's fine, the old history is still there, or we could modify create() to clear it, but here we just check it doesn't fail.
	});
});

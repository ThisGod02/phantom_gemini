import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DEFAULT_DB_PATH = "data/phantom.db";

let db: Database | null = null;

export function getDatabase(path?: string): Database {
	if (db) return db;

	const dbPath = path ?? DEFAULT_DB_PATH;
	const dir = dirname(dbPath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}

	db = new Database(dbPath, { create: true });
	db.run("PRAGMA journal_mode = WAL");
	db.run("PRAGMA foreign_keys = ON");
	return db;
}

export function closeDatabase(): void {
	if (db) {
		db.close();
		db = null;
	}
}

export function createTestDatabase(): Database {
	const testDb = new Database(":memory:");
	testDb.run("PRAGMA journal_mode = WAL");
	testDb.run("PRAGMA foreign_keys = ON");
	return testDb;
}

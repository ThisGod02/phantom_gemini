import type { Database } from "bun:sqlite";
import { MIGRATIONS } from "./schema.ts";

export function runMigrations(db: Database): void {
	db.run(`CREATE TABLE IF NOT EXISTS _migrations (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		index_num INTEGER UNIQUE NOT NULL,
		applied_at TEXT NOT NULL DEFAULT (datetime('now'))
	)`);

	const applied = new Set(
		db
			.query("SELECT index_num FROM _migrations")
			.all()
			.map((row) => (row as { index_num: number }).index_num),
	);

	for (let i = 0; i < MIGRATIONS.length; i++) {
		if (applied.has(i)) continue;
		db.run(MIGRATIONS[i]);
		db.run("INSERT INTO _migrations (index_num) VALUES (?)", [i]);
	}
}

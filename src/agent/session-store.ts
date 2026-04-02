import type { Database } from "bun:sqlite";
import type { Content } from "@google/genai";

export type Session = {
	id: number;
	session_key: string;
	chat_history: string | null; // JSON-сериализованный Content[]
	channel_id: string;
	conversation_id: string;
	status: string;
	total_cost_usd: number;
	input_tokens: number;
	output_tokens: number;
	turn_count: number;
	created_at: string;
	last_active_at: string;
};

const STALE_HOURS = 24;

export class SessionStore {
	private db: Database;

	constructor(db: Database) {
		this.db = db;
	}

	create(channelId: string, conversationId: string): Session {
		const sessionKey = `${channelId}:${conversationId}`;

		// Upsert: если уже есть истёкшая запись — реактивируем, не создаём новую.
		this.db.run(
			`INSERT INTO sessions (session_key, channel_id, conversation_id)
			 VALUES (?, ?, ?)
			 ON CONFLICT(session_key) DO UPDATE SET
			   status = 'active',
			   last_active_at = datetime('now')`,
			[sessionKey, channelId, conversationId],
		);

		return this.getByKey(sessionKey) as Session;
	}

	/**
	 * Возвращает историю чата из SQLite (десериализованный Content[]).
	 * Пустой массив если истории нет или сессия новая.
	 */
	getHistory(sessionKey: string): Content[] {
		const session = this.getByKey(sessionKey);
		if (!session?.chat_history) return [];
		try {
			return JSON.parse(session.chat_history) as Content[];
		} catch {
			return [];
		}
	}

	/**
	 * Сохраняет историю чата в SQLite (JSON TEXT).
	 * Обрезает до MAX_HISTORY_TURNS чтобы не разрастаться бесконечно.
	 */
	saveHistory(sessionKey: string, history: Content[]): void {
		const MAX_HISTORY_TURNS = 20;
		const trimmed = history.slice(-MAX_HISTORY_TURNS);
		this.db.run(
			`UPDATE sessions SET chat_history = ?, last_active_at = datetime('now') WHERE session_key = ?`,
			[JSON.stringify(trimmed), sessionKey],
		);
	}

	/**
	 * Удаляет историю чата (например при ошибке «conversation not found»).
	 */
	clearHistory(sessionKey: string): void {
		this.db.run(
			`UPDATE sessions SET chat_history = NULL, last_active_at = datetime('now') WHERE session_key = ?`,
			[sessionKey],
		);
	}

	getByKey(sessionKey: string): Session | null {
		return this.db.query("SELECT * FROM sessions WHERE session_key = ?").get(sessionKey) as Session | null;
	}

	findActive(channelId: string, conversationId: string): Session | null {
		const sessionKey = `${channelId}:${conversationId}`;
		const session = this.getByKey(sessionKey);

		if (!session) return null;
		if (session.status !== "active") return null;

		if (this.isStale(session)) {
			this.expire(sessionKey);
			return null;
		}

		return session;
	}

// sdk_session_id удалён — теперь используется chat_history (Content[] в SQLite)

	touch(sessionKey: string): void {
		this.db.run("UPDATE sessions SET last_active_at = datetime('now') WHERE session_key = ?", [sessionKey]);
	}

	expire(sessionKey: string): void {
		this.db.run("UPDATE sessions SET status = 'expired' WHERE session_key = ?", [sessionKey]);
	}

	private isStale(session: Session): boolean {
		const lastActive = new Date(session.last_active_at).getTime();
		const now = Date.now();
		const hoursElapsed = (now - lastActive) / (1000 * 60 * 60);
		return hoursElapsed > STALE_HOURS;
	}
}

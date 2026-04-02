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
		this.init();
	}

	private init(): void {
		// Existing sessions table (already exists but for safety)
		this.db.run(`
			CREATE TABLE IF NOT EXISTS web_sessions (
				token TEXT PRIMARY KEY,
				created_at INTEGER NOT NULL,
				expires_at INTEGER NOT NULL
			)
		`);

		this.db.run(`
			CREATE TABLE IF NOT EXISTS magic_links (
				token TEXT PRIMARY KEY,
				session_token TEXT NOT NULL,
				expires_at INTEGER NOT NULL,
				used INTEGER DEFAULT 0
			)
		`);
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
			const history = JSON.parse(session.chat_history) as Content[];
			const HISTORY_CHAR_BUDGET = 20000; // ~5,000 tokens
			const MAX_CHAR_PER_MSG = 5000;
			
			let currentBudget = HISTORY_CHAR_BUDGET;
			const result: Content[] = [];

			// Work backwards to keep newest messages within budget
			for (let i = history.length - 1; i >= 0; i--) {
				const msg = history[i];
				if (!msg.parts) continue;

				// AGGRESSIVE MULTIMODAL PURGE:
				// We keep image data ONLY for the last 2 messages from the user.
				// Older images are stripped to save tokens while keeping the text context.
				const isRecent = i >= history.length - 2;

				const processedParts = msg.parts.map(part => {
					// Handle text parts
					if (part.text && part.text.length > MAX_CHAR_PER_MSG) {
						return { text: part.text.slice(0, MAX_CHAR_PER_MSG) + "\n\n[... message truncated in history ...]" };
					}
					// Handle multimodal parts (inlineData)
					if (part.inlineData) {
						if (isRecent) {
							return part; // Keep recent images
						} else {
							// Return a placeholder for old images to keep the context that an image was there
							return { text: `[Image data purged from history to save tokens. Filename: ${msg.role === "user" ? "user_upload" : "agent_vision"}]` };
						}
					}
					return part;
				});

				// Calculate total message length (text + base64 data)
				const msgLen = processedParts.reduce((sum, p) => {
					const textLen = p.text?.length ?? 0;
					const dataLen = p.inlineData?.data?.length ?? 0;
					return sum + textLen + dataLen;
				}, 0);
				
				if (currentBudget - msgLen > 0 || result.length < 2) { // Always keep at least 2 messages
					result.unshift({ ...msg, parts: processedParts });
					currentBudget -= msgLen;
				} else {
					// If a single message is too huge (e.g. fresh image), we still keep it but it might eat the whole budget
					if (result.length === 0) {
						result.unshift({ ...msg, parts: processedParts });
					}
					break;
				}
			}
			return result;
		} catch {
			return [];
		}
	}

	/**
	 * Сохраняет историю чата в SQLite (JSON TEXT).
	 * Обрезает до разумного предела чтобы база не пухла.
	 */
	saveHistory(sessionKey: string, history: Content[]): void {
		const MAX_HISTORY_TURNS = 50; // Max turns to store on disk
		const MULTIMODAL_DISK_RETENTION = 4; // Keep images only for last 4 turns on disk

		const trimmed = history.slice(-MAX_HISTORY_TURNS).map((msg, idx, arr) => {
			const isRecent = idx >= arr.length - MULTIMODAL_DISK_RETENTION;
			if (isRecent) return msg;

			// Strip heavy image data from older messages before saving to disk
			return {
				...msg,
				parts: (msg.parts || []).map(p => {
					if (p.inlineData) {
						return { text: `[Image data stripped from long-term storage to save space. Filename: ${msg.role === "user" ? "user_upload" : "agent_vision"}]` };
					}
					return p;
				})
			};
		});

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

	// --- Web UI Sessions ---

	saveWebSession(token: string, expiresAt: number): void {
		this.db.run(
			"INSERT OR REPLACE INTO web_sessions (token, created_at, expires_at) VALUES (?, ?, ?)",
			[token, Date.now(), expiresAt],
		);
	}

	isWebSessionValid(token: string): boolean {
		const row = this.db.query("SELECT expires_at FROM web_sessions WHERE token = ?").get(token) as { expires_at: number } | null;
		if (!row) return false;
		if (Date.now() > row.expires_at) {
			this.db.run("DELETE FROM web_sessions WHERE token = ?", [token]);
			return false;
		}
		return true;
	}

	revokeAllWebSessions(): void {
		this.db.run("DELETE FROM web_sessions");
	}

	// --- Magic Links ---

	saveMagicLink(token: string, sessionToken: string, expiresAt: number): void {
		console.log(`[db] Saving magic link to SQLite: ${token.slice(0, 8)}...`);
		this.db.run(
			"INSERT OR REPLACE INTO magic_links (token, session_token, expires_at, used) VALUES (?, ?, ?, 0)",
			[token, sessionToken, expiresAt],
		);
	}

	consumeMagicLink(token: string): string | null {
		const row = this.db.query("SELECT session_token, expires_at, used FROM magic_links WHERE token = ?").get(token) as { session_token: string, expires_at: number, used: number } | null;
		
		if (!row || row.used === 1 || Date.now() > row.expires_at) {
			if (row) {
				console.log(`[db] Magic link not valid or expired: ${token.slice(0, 8)}...`);
				this.db.run("DELETE FROM magic_links WHERE token = ?", [token]);
			}
			return null;
		}

		console.log(`[db] Consuming magic link from SQLite: ${token.slice(0, 8)}...`);
		// Mark as used and delete (one-time use)
		this.db.run("DELETE FROM magic_links WHERE token = ?", [token]);
		return row.session_token;
	}

	getMagicLinkCount(): number {
		const row = this.db.query("SELECT COUNT(*) as count FROM magic_links WHERE used = 0 AND expires_at > ?").get(Date.now()) as { count: number };
		return row.count;
	}
}

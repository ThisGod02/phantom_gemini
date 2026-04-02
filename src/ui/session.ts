import { randomBytes } from "node:crypto";
import type { SessionStore } from "../agent/session-store.ts";

let sessionStore: SessionStore | null = null;

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAGIC_LINK_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function setSessionStore(store: SessionStore): void {
	sessionStore = store;
}

export function createSession(): { sessionToken: string; magicToken: string } {
	if (!sessionStore) throw new Error("Session store not initialized");

	const sessionToken = randomBytes(32).toString("base64url");
	const magicToken = randomBytes(24).toString("base64url");
	const now = Date.now();

	sessionStore.saveWebSession(sessionToken, now + SESSION_TTL_MS);
	sessionStore.saveMagicLink(magicToken, sessionToken, now + MAGIC_LINK_TTL_MS);

	console.log(`[session] Created Magic Link: ${magicToken.slice(0, 8)}...`);
	return { sessionToken, magicToken };
}

export function isValidSession(token: string): boolean {
	if (!sessionStore) return false;
	return sessionStore.isWebSessionValid(token);
}

export function consumeMagicLink(magicToken: string): string | null {
	if (!sessionStore) return null;
	const sessionToken = sessionStore.consumeMagicLink(magicToken);
	if (sessionToken) {
		console.log(`[session] Magic Link consumed: ${magicToken.slice(0, 8)}...`);
	}
	return sessionToken;
}

export function revokeAllSessions(): void {
	if (sessionStore) {
		sessionStore.revokeAllWebSessions();
	}
}

export function getSessionCount(): number {
	// Not easily available without dedicated query, but not critical
	return 0;
}

export function getMagicLinkCount(): number {
	if (!sessionStore) return 0;
	return sessionStore.getMagicLinkCount();
}

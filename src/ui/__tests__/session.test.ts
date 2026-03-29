import { afterEach, describe, expect, test } from "bun:test";
import {
	consumeMagicLink,
	createSession,
	getMagicLinkCount,
	getSessionCount,
	isValidSession,
	revokeAllSessions,
} from "../session.ts";

afterEach(() => {
	revokeAllSessions();
});

describe("createSession", () => {
	test("returns a session token and magic token", () => {
		const { sessionToken, magicToken } = createSession();
		expect(sessionToken).toBeTruthy();
		expect(magicToken).toBeTruthy();
		expect(sessionToken).not.toBe(magicToken);
	});

	test("session token is valid immediately after creation", () => {
		const { sessionToken } = createSession();
		expect(isValidSession(sessionToken)).toBe(true);
	});

	test("multiple sessions have unique tokens", () => {
		const a = createSession();
		const b = createSession();
		expect(a.sessionToken).not.toBe(b.sessionToken);
		expect(a.magicToken).not.toBe(b.magicToken);
	});

	test("increments session count", () => {
		expect(getSessionCount()).toBe(0);
		createSession();
		expect(getSessionCount()).toBe(1);
		createSession();
		expect(getSessionCount()).toBe(2);
	});
});

describe("isValidSession", () => {
	test("returns false for unknown token", () => {
		expect(isValidSession("nonexistent-token")).toBe(false);
	});

	test("returns true for valid session", () => {
		const { sessionToken } = createSession();
		expect(isValidSession(sessionToken)).toBe(true);
	});
});

describe("consumeMagicLink", () => {
	test("returns session token for valid magic link", () => {
		const { sessionToken, magicToken } = createSession();
		const result = consumeMagicLink(magicToken);
		expect(result).toBe(sessionToken);
	});

	test("magic link is single-use", () => {
		const { magicToken } = createSession();
		const first = consumeMagicLink(magicToken);
		expect(first).not.toBeNull();

		const second = consumeMagicLink(magicToken);
		expect(second).toBeNull();
	});

	test("returns null for unknown token", () => {
		expect(consumeMagicLink("bogus-token")).toBeNull();
	});

	test("decrements magic link count after consumption", () => {
		createSession();
		expect(getMagicLinkCount()).toBe(1);
		const { magicToken } = createSession();
		expect(getMagicLinkCount()).toBe(2);

		consumeMagicLink(magicToken);
		expect(getMagicLinkCount()).toBe(1);
	});
});

describe("revokeAllSessions", () => {
	test("clears all sessions and magic links", () => {
		createSession();
		createSession();
		expect(getSessionCount()).toBe(2);
		expect(getMagicLinkCount()).toBe(2);

		revokeAllSessions();
		expect(getSessionCount()).toBe(0);
		expect(getMagicLinkCount()).toBe(0);
	});

	test("previously valid sessions become invalid", () => {
		const { sessionToken } = createSession();
		expect(isValidSession(sessionToken)).toBe(true);

		revokeAllSessions();
		expect(isValidSession(sessionToken)).toBe(false);
	});
});

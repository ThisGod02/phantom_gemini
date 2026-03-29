import { describe, expect, test } from "bun:test";
import { computeBackoffNextRun, computeNextRunAt, parseScheduleValue, serializeScheduleValue } from "../schedule.ts";
import type { Schedule } from "../types.ts";

describe("computeNextRunAt", () => {
	test("at schedule: returns the date if in the future", () => {
		const future = new Date(Date.now() + 60_000).toISOString();
		const schedule: Schedule = { kind: "at", at: future };
		const result = computeNextRunAt(schedule);
		expect(result).not.toBeNull();
		expect(result?.toISOString()).toBe(future);
	});

	test("at schedule: returns null if in the past", () => {
		const past = new Date(Date.now() - 60_000).toISOString();
		const schedule: Schedule = { kind: "at", at: past };
		const result = computeNextRunAt(schedule);
		expect(result).toBeNull();
	});

	test("at schedule: returns null for invalid date", () => {
		const schedule: Schedule = { kind: "at", at: "not-a-date" };
		const result = computeNextRunAt(schedule);
		expect(result).toBeNull();
	});

	test("every schedule: returns now + intervalMs", () => {
		const now = Date.now();
		const schedule: Schedule = { kind: "every", intervalMs: 30_000 };
		const result = computeNextRunAt(schedule, now);
		expect(result).not.toBeNull();
		expect(result?.getTime()).toBe(now + 30_000);
	});

	test("cron schedule: returns the next cron occurrence", () => {
		const schedule: Schedule = { kind: "cron", expr: "* * * * *" };
		const result = computeNextRunAt(schedule);
		expect(result).not.toBeNull();
		if (!result) return;
		const diffMs = result.getTime() - Date.now();
		// Next minute should be within 60 seconds
		expect(diffMs).toBeGreaterThan(0);
		expect(diffMs).toBeLessThanOrEqual(60_000);
	});

	test("cron schedule with timezone: returns valid date", () => {
		const schedule: Schedule = { kind: "cron", expr: "0 9 * * *", tz: "America/New_York" };
		const result = computeNextRunAt(schedule);
		expect(result).not.toBeNull();
	});

	test("cron schedule: returns null for invalid expression", () => {
		const schedule: Schedule = { kind: "cron", expr: "invalid cron" };
		const result = computeNextRunAt(schedule);
		expect(result).toBeNull();
	});
});

describe("serializeScheduleValue and parseScheduleValue", () => {
	test("round-trips at schedule", () => {
		const schedule: Schedule = { kind: "at", at: "2026-03-26T09:00:00Z" };
		const serialized = serializeScheduleValue(schedule);
		const parsed = parseScheduleValue("at", serialized);
		expect(parsed).toEqual(schedule);
	});

	test("round-trips every schedule", () => {
		const schedule: Schedule = { kind: "every", intervalMs: 1800000 };
		const serialized = serializeScheduleValue(schedule);
		const parsed = parseScheduleValue("every", serialized);
		expect(parsed).toEqual(schedule);
	});

	test("round-trips cron schedule with timezone", () => {
		const schedule: Schedule = { kind: "cron", expr: "0 9 * * 1-5", tz: "America/Los_Angeles" };
		const serialized = serializeScheduleValue(schedule);
		const parsed = parseScheduleValue("cron", serialized);
		expect(parsed).toEqual(schedule);
	});

	test("round-trips cron schedule without timezone", () => {
		const schedule: Schedule = { kind: "cron", expr: "*/5 * * * *" };
		const serialized = serializeScheduleValue(schedule);
		const parsed = parseScheduleValue("cron", serialized);
		expect(parsed).toEqual(schedule);
	});

	test("throws for unknown schedule kind", () => {
		expect(() => parseScheduleValue("unknown", "{}")).toThrow("Unknown schedule kind");
	});
});

describe("computeBackoffNextRun", () => {
	test("1st error: ~30s delay", () => {
		const result = computeBackoffNextRun(1);
		const delayMs = result.getTime() - Date.now();
		expect(delayMs).toBeGreaterThan(29_000);
		expect(delayMs).toBeLessThan(31_000);
	});

	test("2nd error: ~60s delay", () => {
		const result = computeBackoffNextRun(2);
		const delayMs = result.getTime() - Date.now();
		expect(delayMs).toBeGreaterThan(59_000);
		expect(delayMs).toBeLessThan(61_000);
	});

	test("5th+ error: ~60min delay", () => {
		const result = computeBackoffNextRun(5);
		const delayMs = result.getTime() - Date.now();
		expect(delayMs).toBeGreaterThan(3_599_000);
		expect(delayMs).toBeLessThan(3_601_000);
	});

	test("high consecutive errors cap at max delay", () => {
		const result = computeBackoffNextRun(100);
		const delayMs = result.getTime() - Date.now();
		expect(delayMs).toBeGreaterThan(3_599_000);
		expect(delayMs).toBeLessThan(3_601_000);
	});
});

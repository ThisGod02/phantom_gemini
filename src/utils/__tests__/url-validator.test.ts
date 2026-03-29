import { describe, expect, test } from "bun:test";
import { isSafeCallbackUrl } from "../url-validator.ts";

describe("isSafeCallbackUrl", () => {
	test("allows public HTTPS URLs", () => {
		expect(isSafeCallbackUrl("https://example.com/webhook")).toEqual({ safe: true });
		expect(isSafeCallbackUrl("https://api.zapier.com/callback")).toEqual({ safe: true });
		expect(isSafeCallbackUrl("https://hooks.slack.com/services/T00000000/B00000000/xxxx")).toEqual({ safe: true });
	});

	test("allows public HTTP URLs", () => {
		expect(isSafeCallbackUrl("http://example.com/webhook")).toEqual({ safe: true });
	});

	test("blocks localhost", () => {
		expect(isSafeCallbackUrl("http://localhost:6333")).toMatchObject({ safe: false });
		expect(isSafeCallbackUrl("http://127.0.0.1:6333")).toMatchObject({ safe: false });
		expect(isSafeCallbackUrl("http://0.0.0.0:3100")).toMatchObject({ safe: false });
		expect(isSafeCallbackUrl("http://[::1]:6333")).toMatchObject({ safe: false });
	});

	test("blocks private IP ranges - 10.x.x.x", () => {
		expect(isSafeCallbackUrl("http://10.0.0.1/secret")).toMatchObject({ safe: false });
		expect(isSafeCallbackUrl("http://10.255.255.255/data")).toMatchObject({ safe: false });
	});

	test("blocks private IP ranges - 172.16-31.x.x", () => {
		expect(isSafeCallbackUrl("http://172.16.0.1/internal")).toMatchObject({ safe: false });
		expect(isSafeCallbackUrl("http://172.31.255.255/internal")).toMatchObject({ safe: false });
	});

	test("allows non-private 172.x ranges", () => {
		expect(isSafeCallbackUrl("http://172.15.0.1/ok")).toEqual({ safe: true });
		expect(isSafeCallbackUrl("http://172.32.0.1/ok")).toEqual({ safe: true });
	});

	test("blocks private IP ranges - 192.168.x.x", () => {
		expect(isSafeCallbackUrl("http://192.168.1.1/admin")).toMatchObject({ safe: false });
		expect(isSafeCallbackUrl("http://192.168.0.1/router")).toMatchObject({ safe: false });
	});

	test("blocks cloud metadata endpoints via IP", () => {
		expect(isSafeCallbackUrl("http://169.254.169.254/latest/meta-data")).toMatchObject({ safe: false });
		expect(isSafeCallbackUrl("http://169.254.169.254/computeMetadata/v1")).toMatchObject({ safe: false });
	});

	test("blocks cloud metadata endpoints via hostname", () => {
		expect(isSafeCallbackUrl("http://metadata.google.internal/computeMetadata/v1")).toMatchObject({ safe: false });
		expect(isSafeCallbackUrl("http://metadata.google.com/computeMetadata/v1")).toMatchObject({ safe: false });
	});

	test("blocks non-HTTP protocols", () => {
		expect(isSafeCallbackUrl("ftp://example.com")).toMatchObject({ safe: false });
		expect(isSafeCallbackUrl("file:///etc/passwd")).toMatchObject({ safe: false });
		expect(isSafeCallbackUrl("javascript:alert(1)")).toMatchObject({ safe: false });
	});

	test("rejects invalid URLs", () => {
		expect(isSafeCallbackUrl("not-a-url")).toMatchObject({ safe: false });
		expect(isSafeCallbackUrl("")).toMatchObject({ safe: false });
		expect(isSafeCallbackUrl("://missing-protocol")).toMatchObject({ safe: false });
	});

	test("blocks 127.x.x.x loopback range", () => {
		expect(isSafeCallbackUrl("http://127.0.0.2:8080")).toMatchObject({ safe: false });
		expect(isSafeCallbackUrl("http://127.255.255.255")).toMatchObject({ safe: false });
	});
});

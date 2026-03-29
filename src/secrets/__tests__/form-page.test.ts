import { describe, expect, test } from "bun:test";
import { secretsExpiredHtml, secretsFormHtml } from "../form-page.ts";
import type { SecretRequest } from "../store.ts";

function makeRequest(overrides?: Partial<SecretRequest>): SecretRequest {
	return {
		requestId: "sec_test123",
		fields: [
			{
				name: "gitlab_token",
				label: "GitLab Personal Access Token",
				description: "Go to GitLab > User Settings > Access Tokens.",
				type: "password",
				required: true,
				placeholder: "glpat-xxxxxxxxxxxxxxxxxxxx",
			},
			{
				name: "gitlab_url",
				label: "GitLab URL",
				type: "text",
				required: false,
				default: "https://gitlab.com",
			},
		],
		purpose: "Access your GitLab repositories",
		notifyChannel: "slack",
		notifyChannelId: "C123",
		notifyThread: "1234.5678",
		magicTokenHash: "abc",
		status: "pending",
		createdAt: new Date().toISOString(),
		expiresAt: new Date(Date.now() + 600000).toISOString(),
		completedAt: null,
		...overrides,
	};
}

describe("secretsFormHtml", () => {
	test("returns valid HTML with doctype", () => {
		const html = secretsFormHtml(makeRequest());
		expect(html).toStartWith("<!DOCTYPE html>");
		expect(html).toContain("</html>");
	});

	test("includes the purpose text", () => {
		const html = secretsFormHtml(makeRequest());
		expect(html).toContain("access your gitlab repositories");
	});

	test("includes field labels", () => {
		const html = secretsFormHtml(makeRequest());
		expect(html).toContain("GitLab Personal Access Token");
		expect(html).toContain("GitLab URL");
	});

	test("includes field descriptions", () => {
		const html = secretsFormHtml(makeRequest());
		expect(html).toContain("Go to GitLab");
	});

	test("includes placeholder attributes", () => {
		const html = secretsFormHtml(makeRequest());
		expect(html).toContain('placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"');
	});

	test("includes default values", () => {
		const html = secretsFormHtml(makeRequest());
		expect(html).toContain('value="https://gitlab.com"');
	});

	test("marks required fields", () => {
		const html = secretsFormHtml(makeRequest());
		expect(html).toContain("text-error"); // Required asterisk class
		expect(html).toContain("required");
	});

	test("includes password toggle for password fields", () => {
		const html = secretsFormHtml(makeRequest());
		expect(html).toContain("toggle-vis-btn");
		expect(html).toContain("icon-eye");
	});

	test("includes the request ID in the form", () => {
		const html = secretsFormHtml(makeRequest());
		expect(html).toContain('data-request-id="sec_test123"');
	});

	test("includes security assurance text", () => {
		const html = secretsFormHtml(makeRequest());
		expect(html).toContain("AES-256-GCM");
		expect(html).toContain("Never sent to Anthropic");
	});

	test("includes theme toggle", () => {
		const html = secretsFormHtml(makeRequest());
		expect(html).toContain("theme-toggle");
	});

	test("includes DaisyUI and Tailwind CDN", () => {
		const html = secretsFormHtml(makeRequest());
		expect(html).toContain("daisyui@5");
		expect(html).toContain("@tailwindcss/browser@4");
	});

	test("includes Inter font", () => {
		const html = secretsFormHtml(makeRequest());
		expect(html).toContain("Inter");
	});

	test("includes phantom-light and phantom-dark themes", () => {
		const html = secretsFormHtml(makeRequest());
		expect(html).toContain("phantom-light");
		expect(html).toContain("phantom-dark");
	});

	test("includes fadeUp animation", () => {
		const html = secretsFormHtml(makeRequest());
		expect(html).toContain("form-animate");
		expect(html).toContain("fadeUp");
	});

	test("escapes HTML in purpose text", () => {
		const html = secretsFormHtml(makeRequest({ purpose: '<script>alert("xss")</script>' }));
		expect(html).not.toContain("<script>alert");
		expect(html).toContain("&lt;script&gt;");
	});

	test("handles single field form", () => {
		const req = makeRequest({
			fields: [{ name: "api_key", label: "API Key", type: "password", required: true }],
		});
		const html = secretsFormHtml(req);
		expect(html).toContain("API Key");
	});
});

describe("secretsExpiredHtml", () => {
	test("returns valid HTML", () => {
		const html = secretsExpiredHtml();
		expect(html).toStartWith("<!DOCTYPE html>");
	});

	test("includes expired message", () => {
		const html = secretsExpiredHtml();
		expect(html).toContain("Link Expired");
	});

	test("includes guidance to ask agent", () => {
		const html = secretsExpiredHtml();
		expect(html).toContain("Ask your Phantom agent");
	});
});

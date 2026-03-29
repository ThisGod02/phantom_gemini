import { describe, expect, test } from "bun:test";
import { splitMessage, toSlackMarkdown, truncateForSlack } from "../slack-formatter.ts";

describe("toSlackMarkdown", () => {
	test("converts bold from **text** to *text*", () => {
		expect(toSlackMarkdown("This is **bold** text")).toBe("This is *bold* text");
	});

	test("converts double underscore bold to *text*", () => {
		expect(toSlackMarkdown("This is __bold__ text")).toBe("This is *bold* text");
	});

	test("converts strikethrough from ~~text~~ to ~text~", () => {
		expect(toSlackMarkdown("This is ~~struck~~ text")).toBe("This is ~struck~ text");
	});

	test("converts links from [text](url) to <url|text>", () => {
		expect(toSlackMarkdown("Visit [Google](https://google.com)")).toBe("Visit <https://google.com|Google>");
	});

	test("converts headers to bold", () => {
		expect(toSlackMarkdown("## My Header")).toBe("*My Header*");
		expect(toSlackMarkdown("# Top Header")).toBe("*Top Header*");
		expect(toSlackMarkdown("### Sub Header")).toBe("*Sub Header*");
	});

	test("converts unordered list items", () => {
		expect(toSlackMarkdown("- Item one\n- Item two")).toBe("\u2022 Item one\n\u2022 Item two");
		expect(toSlackMarkdown("* Item one")).toBe("\u2022 Item one");
	});

	test("preserves inline code", () => {
		expect(toSlackMarkdown("Use `**bold**` in markdown")).toBe("Use `**bold**` in markdown");
	});

	test("preserves code blocks", () => {
		const input = "Before\n```\n**not bold**\n```\nAfter **bold**";
		const result = toSlackMarkdown(input);
		expect(result).toContain("```\n**not bold**\n```");
		expect(result).toContain("After *bold*");
	});

	test("handles empty string", () => {
		expect(toSlackMarkdown("")).toBe("");
	});

	test("handles plain text without markdown", () => {
		expect(toSlackMarkdown("Hello world")).toBe("Hello world");
	});

	test("handles multiple conversions in one string", () => {
		const input = "**Bold** and [link](http://x.com) and ~~struck~~";
		const result = toSlackMarkdown(input);
		expect(result).toBe("*Bold* and <http://x.com|link> and ~struck~");
	});
});

describe("truncateForSlack", () => {
	test("returns short text unchanged", () => {
		expect(truncateForSlack("hello", 100)).toBe("hello");
	});

	test("truncates long text with notice", () => {
		const long = "a".repeat(200);
		const result = truncateForSlack(long, 100);
		expect(result.length).toBeLessThan(200);
		expect(result).toContain("truncated");
		expect(result).toContain("200 characters");
	});

	test("uses default limit of 3900", () => {
		const text = "x".repeat(3900);
		expect(truncateForSlack(text)).toBe(text);
	});
});

describe("splitMessage", () => {
	test("returns single-element array for short messages", () => {
		expect(splitMessage("hello")).toEqual(["hello"]);
	});

	test("splits long messages", () => {
		const long = `${"a".repeat(100)}\n\n${"b".repeat(100)}`;
		const chunks = splitMessage(long, 110);
		expect(chunks.length).toBeGreaterThan(1);
	});

	test("preserves all content across chunks", () => {
		const parts = ["Part one content here", "Part two content here", "Part three content here"];
		const text = parts.join("\n\n");
		const chunks = splitMessage(text, 30);
		const reassembled = chunks.join(" ");
		for (const part of parts) {
			expect(reassembled).toContain(part.trim());
		}
	});

	test("handles text with no good split points", () => {
		const long = "a".repeat(200);
		const chunks = splitMessage(long, 100);
		expect(chunks.length).toBe(2);
		expect(chunks[0].length).toBe(100);
	});
});

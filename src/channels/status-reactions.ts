/**
 * Channel-agnostic status reaction controller.
 * Communicates agent processing state through emoji reactions on user messages.
 *
 * Inspired by OpenClaw's pattern but simplified for Phantom's architecture:
 * - Promise chain serialization prevents concurrent API calls
 * - Debouncing at 500ms prevents flickering between rapid state changes
 * - Terminal states (done/error) fire immediately, not debounced
 * - Stall timers warn the user if the agent appears stuck
 */

export type ReactionAdapter = {
	addReaction: (emoji: string) => Promise<void>;
	removeReaction: (emoji: string) => Promise<void>;
};

export type StatusEmojis = {
	queued: string;
	thinking: string;
	tool: string;
	coding: string;
	web: string;
	done: string;
	error: string;
	stallSoft: string;
	stallHard: string;
};

export type StatusTiming = {
	debounceMs: number;
	stallSoftMs: number;
	stallHardMs: number;
};

export const DEFAULT_EMOJIS: StatusEmojis = {
	queued: "eyes",
	thinking: "brain",
	tool: "wrench",
	coding: "computer",
	web: "globe_with_meridians",
	done: "white_check_mark",
	error: "warning",
	stallSoft: "hourglass_flowing_sand",
	stallHard: "exclamation",
};

export const DEFAULT_TIMING: StatusTiming = {
	debounceMs: 500,
	stallSoftMs: 10_000,
	stallHardMs: 30_000,
};

const CODING_TOKENS = ["read", "write", "edit", "bash", "glob", "grep"];
const WEB_TOKENS = ["web_search", "websearch", "web_fetch", "webfetch", "browser"];

export function resolveToolEmoji(toolName: string | undefined, emojis: StatusEmojis): string {
	const name = toolName?.toLowerCase() ?? "";
	if (!name) return emojis.tool;
	if (WEB_TOKENS.some((t) => name.includes(t))) return emojis.web;
	if (CODING_TOKENS.some((t) => name.includes(t))) return emojis.coding;
	return emojis.tool;
}

export type StatusReactionController = {
	setQueued: () => void;
	setThinking: () => void;
	setTool: (toolName?: string) => void;
	setDone: () => Promise<void>;
	setError: () => Promise<void>;
	dispose: () => void;
};

export function createStatusReactionController(params: {
	adapter: ReactionAdapter;
	emojis?: Partial<StatusEmojis>;
	timing?: Partial<StatusTiming>;
	onError?: (err: unknown) => void;
}): StatusReactionController {
	const emojis: StatusEmojis = { ...DEFAULT_EMOJIS, ...params.emojis };
	const timing: StatusTiming = { ...DEFAULT_TIMING, ...params.timing };
	const { adapter, onError } = params;

	let currentEmoji = "";
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let stallSoftTimer: ReturnType<typeof setTimeout> | null = null;
	let stallHardTimer: ReturnType<typeof setTimeout> | null = null;
	let finished = false;
	let chain = Promise.resolve();

	function enqueue(fn: () => Promise<void>): Promise<void> {
		chain = chain.then(fn, fn);
		return chain;
	}

	function clearTimers(): void {
		if (debounceTimer) clearTimeout(debounceTimer);
		if (stallSoftTimer) clearTimeout(stallSoftTimer);
		if (stallHardTimer) clearTimeout(stallHardTimer);
		debounceTimer = null;
		stallSoftTimer = null;
		stallHardTimer = null;
	}

	function resetStallTimers(): void {
		if (stallSoftTimer) clearTimeout(stallSoftTimer);
		if (stallHardTimer) clearTimeout(stallHardTimer);

		stallSoftTimer = setTimeout(() => {
			if (!finished) applyDebounced(emojis.stallSoft, true);
		}, timing.stallSoftMs);

		stallHardTimer = setTimeout(() => {
			if (!finished) applyDebounced(emojis.stallHard, true);
		}, timing.stallHardMs);
	}

	async function applyEmoji(emoji: string): Promise<void> {
		try {
			const prev = currentEmoji;
			if (prev && prev !== emoji) {
				await adapter.removeReaction(prev);
			}
			await adapter.addReaction(emoji);
			currentEmoji = emoji;
		} catch (err) {
			onError?.(err);
		}
	}

	function applyDebounced(emoji: string, immediate = false): void {
		if (finished || emoji === currentEmoji) return;

		if (debounceTimer) clearTimeout(debounceTimer);

		if (immediate) {
			void enqueue(() => applyEmoji(emoji));
		} else {
			debounceTimer = setTimeout(() => {
				void enqueue(() => applyEmoji(emoji));
			}, timing.debounceMs);
		}
		resetStallTimers();
	}

	function finishWith(emoji: string): Promise<void> {
		if (finished) return Promise.resolve();
		finished = true;
		clearTimers();
		return enqueue(() => applyEmoji(emoji));
	}

	return {
		setQueued: () => applyDebounced(emojis.queued, true),
		setThinking: () => applyDebounced(emojis.thinking),
		setTool: (toolName?: string) => {
			const emoji = resolveToolEmoji(toolName, emojis);
			applyDebounced(emoji);
		},
		setDone: () => finishWith(emojis.done),
		setError: () => finishWith(emojis.error),
		dispose: () => {
			finished = true;
			clearTimers();
		},
	};
}

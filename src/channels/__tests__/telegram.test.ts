import { beforeEach, describe, expect, mock, test } from "bun:test";
import { TelegramChannel, type TelegramChannelConfig } from "../telegram.ts";

// Mock Telegraf
const mockLaunch = mock(() => Promise.resolve());
const mockStop = mock(() => {});
const mockSendMessage = mock(async (_chatId: number | string, _text: string, _opts?: Record<string, unknown>) => ({
	message_id: 42,
}));
const mockEditMessageText = mock(
	async (
		_chatId: number | string,
		_msgId: number,
		_inlineMsgId: string | undefined,
		_text: string,
		_opts?: Record<string, unknown>,
	) => ({}),
);
const mockSendChatAction = mock(async (_chatId: number | string, _action: string) => {});

type HandlerFn = (ctx: Record<string, unknown>) => Promise<void>;
const commandHandlers = new Map<string, HandlerFn>();
const eventHandlers = new Map<string, HandlerFn>();
const actionPatterns: Array<{ pattern: RegExp; handler: HandlerFn }> = [];

const MockTelegraf = mock((_token: string) => ({
	launch: mockLaunch,
	stop: mockStop,
	command: (cmd: string, handler: HandlerFn) => {
		commandHandlers.set(cmd, handler);
	},
	on: (event: string, handler: HandlerFn) => {
		eventHandlers.set(event, handler);
	},
	action: (pattern: RegExp, handler: HandlerFn) => {
		actionPatterns.push({ pattern, handler });
	},
	telegram: {
		sendMessage: mockSendMessage,
		editMessageText: mockEditMessageText,
		sendChatAction: mockSendChatAction,
	},
}));

mock.module("telegraf", () => ({
	Telegraf: MockTelegraf,
}));

const testConfig: TelegramChannelConfig = {
	botToken: "123456:ABC-DEF",
};

describe("TelegramChannel", () => {
	beforeEach(() => {
		commandHandlers.clear();
		eventHandlers.clear();
		actionPatterns.length = 0;
		mockLaunch.mockClear();
		mockStop.mockClear();
		mockSendMessage.mockClear();
		mockEditMessageText.mockClear();
		mockSendChatAction.mockClear();
	});

	test("has correct id and capabilities", () => {
		const channel = new TelegramChannel(testConfig);
		expect(channel.id).toBe("telegram");
		expect(channel.name).toBe("Telegram");
		expect(channel.capabilities.inlineKeyboards).toBe(true);
		expect(channel.capabilities.typing).toBe(true);
		expect(channel.capabilities.messageEditing).toBe(true);
	});

	test("starts disconnected", () => {
		const channel = new TelegramChannel(testConfig);
		expect(channel.isConnected()).toBe(false);
	});

	test("connect transitions to connected", async () => {
		const channel = new TelegramChannel(testConfig);
		await channel.connect();
		expect(channel.isConnected()).toBe(true);
		expect(mockLaunch).toHaveBeenCalledTimes(1);
	});

	test("disconnect transitions to disconnected", async () => {
		const channel = new TelegramChannel(testConfig);
		await channel.connect();
		await channel.disconnect();
		expect(channel.isConnected()).toBe(false);
	});

	test("registers command handlers on connect", async () => {
		const channel = new TelegramChannel(testConfig);
		await channel.connect();
		expect(commandHandlers.has("start")).toBe(true);
		expect(commandHandlers.has("status")).toBe(true);
		expect(commandHandlers.has("help")).toBe(true);
	});

	test("registers text handler on connect", async () => {
		const channel = new TelegramChannel(testConfig);
		await channel.connect();
		expect(eventHandlers.has("text")).toBe(true);
	});

	test("routes text messages to handler", async () => {
		const channel = new TelegramChannel(testConfig);
		let receivedText = "";

		channel.onMessage(async (msg) => {
			receivedText = msg.text;
		});

		await channel.connect();

		const textHandler = eventHandlers.get("text");
		expect(textHandler).toBeDefined();
		if (textHandler) {
			await textHandler({
				message: {
					text: "Hello Phantom",
					from: { id: 12345, first_name: "Test" },
					chat: { id: 67890 },
					message_id: 1,
				},
			});
		}

		expect(receivedText).toBe("Hello Phantom");
	});

	test("ignores slash commands in text handler", async () => {
		const channel = new TelegramChannel(testConfig);
		let handlerCalled = false;

		channel.onMessage(async () => {
			handlerCalled = true;
		});

		await channel.connect();

		const textHandler = eventHandlers.get("text");
		if (textHandler) {
			await textHandler({
				message: {
					text: "/start",
					from: { id: 12345 },
					chat: { id: 67890 },
					message_id: 1,
				},
			});
		}

		expect(handlerCalled).toBe(false);
	});

	test("sends message via send method", async () => {
		const channel = new TelegramChannel(testConfig);
		await channel.connect();

		const result = await channel.send("telegram:67890", { text: "Hello" });
		expect(result.channelId).toBe("telegram");
		expect(result.id).toBe("42");
		expect(mockSendMessage).toHaveBeenCalledTimes(1);
	});

	test("startTyping sends chat action and sets interval", async () => {
		const channel = new TelegramChannel(testConfig);
		await channel.connect();

		channel.startTyping(67890);
		expect(mockSendChatAction).toHaveBeenCalledWith(67890, "typing");

		channel.stopTyping(67890);
	});

	test("stopTyping clears the typing interval", async () => {
		const channel = new TelegramChannel(testConfig);
		await channel.connect();

		channel.startTyping(67890);
		channel.stopTyping(67890);

		// The interval fires every 4s. Wait 4.5s to confirm it was cleared.
		// Use a shorter wait than the old 5s to stay within bun's test timeout.
		mockSendChatAction.mockClear();
		await new Promise((r) => setTimeout(r, 4500));
		expect(mockSendChatAction).not.toHaveBeenCalled();
	}, 10000);

	test("editMessage calls telegram API", async () => {
		const channel = new TelegramChannel(testConfig);
		await channel.connect();

		await channel.editMessage(67890, 42, "Updated text");
		expect(mockEditMessageText).toHaveBeenCalledTimes(1);
	});
});

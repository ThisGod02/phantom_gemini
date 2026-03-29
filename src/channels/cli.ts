import { randomUUID } from "node:crypto";
import { type Interface as ReadlineInterface, createInterface } from "node:readline";
import type { Channel, ChannelCapabilities, InboundMessage, OutboundMessage, SentMessage } from "./types.ts";

const CLI_CHANNEL_ID = "cli";
const CLI_CONVERSATION_ID = "cli:local";
const CLI_SENDER_ID = "user";

export class CliChannel implements Channel {
	readonly id = CLI_CHANNEL_ID;
	readonly name = "CLI";
	readonly capabilities: ChannelCapabilities = {
		threads: false,
		richText: false,
		attachments: false,
		buttons: false,
	};

	private rl: ReadlineInterface | null = null;
	private messageHandler: ((message: InboundMessage) => Promise<void>) | null = null;
	private connected = false;

	connect(): Promise<void> {
		if (this.connected) return Promise.resolve();

		this.rl = createInterface({
			input: process.stdin,
			output: process.stdout,
			prompt: "\nYou: ",
		});

		this.connected = true;

		this.rl.on("line", (line) => {
			const trimmed = line.trim();
			if (!trimmed) {
				this.rl?.prompt();
				return;
			}

			if (trimmed === "/quit" || trimmed === "/exit") {
				process.emit("SIGINT" as NodeJS.Signals);
				return;
			}

			const message: InboundMessage = {
				id: randomUUID(),
				channelId: this.id,
				conversationId: CLI_CONVERSATION_ID,
				senderId: CLI_SENDER_ID,
				senderName: "User",
				text: trimmed,
				timestamp: new Date(),
			};

			if (this.messageHandler) {
				this.messageHandler(message).catch((err: unknown) => {
					const msg = err instanceof Error ? err.message : String(err);
					console.error(`\n[cli] Error: ${msg}`);
					this.rl?.prompt();
				});
			}
		});

		this.rl.on("close", () => {
			this.connected = false;
		});

		console.log("\n--- Phantom CLI ---");
		console.log('Type a message to talk to Phantom. Type "/quit" to exit.\n');
		this.rl.prompt();

		return Promise.resolve();
	}

	disconnect(): Promise<void> {
		if (this.rl) {
			this.rl.close();
			this.rl = null;
		}
		this.connected = false;
		return Promise.resolve();
	}

	send(_conversationId: string, message: OutboundMessage): Promise<SentMessage> {
		const text = message.text;
		console.log(`\nPhantom: ${text}`);
		this.rl?.prompt();

		return Promise.resolve({
			id: randomUUID(),
			channelId: this.id,
			conversationId: CLI_CONVERSATION_ID,
			timestamp: new Date(),
		});
	}

	onMessage(handler: (message: InboundMessage) => Promise<void>): void {
		this.messageHandler = handler;
	}
}

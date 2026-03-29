/**
 * Generic webhook channel with HMAC-SHA256 signature verification.
 * Supports synchronous (inline) and asynchronous (callback URL) response modes.
 * Compatible with Zapier, Make, n8n, and custom integrations.
 */

import { randomUUID, timingSafeEqual } from "node:crypto";
import { isSafeCallbackUrl } from "../utils/url-validator.ts";
import type { Channel, ChannelCapabilities, InboundMessage, OutboundMessage, SentMessage } from "./types.ts";

export type WebhookChannelConfig = {
	secret: string;
	/** Max time in ms to wait for agent response in sync mode. Default 25000 (25s). */
	syncTimeoutMs?: number;
};

export type WebhookPayload = {
	message: string;
	conversation_id: string;
	user_id?: string;
	thread_id?: string;
	metadata?: Record<string, unknown>;
	callback_url?: string;
	timestamp: number;
	signature: string;
};

export type WebhookResponse = {
	status: "ok" | "accepted" | "error";
	response?: string;
	task_id?: string;
	message?: string;
	metadata?: {
		session_id?: string;
		cost_usd?: number;
		duration_ms?: number;
	};
};

type PendingResponse = {
	resolve: (text: string) => void;
	timer: ReturnType<typeof setTimeout>;
};

export class WebhookChannel implements Channel {
	readonly id = "webhook";
	readonly name = "Webhook";
	readonly capabilities: ChannelCapabilities = {
		threads: false,
		richText: false,
		attachments: false,
		buttons: false,
	};

	private config: WebhookChannelConfig;
	private messageHandler: ((message: InboundMessage) => Promise<void>) | null = null;
	private connected = false;
	// Track pending sync responses: taskId -> resolver
	private pendingResponses = new Map<string, PendingResponse>();
	// Track async callback URLs: conversationId -> callbackUrl
	private callbackUrls = new Map<string, string>();

	constructor(config: WebhookChannelConfig) {
		this.config = config;
	}

	async connect(): Promise<void> {
		this.connected = true;
		console.log("[webhook] Channel ready");
	}

	async disconnect(): Promise<void> {
		// Clean up pending responses
		for (const [, pending] of this.pendingResponses) {
			clearTimeout(pending.timer);
			pending.resolve("");
		}
		this.pendingResponses.clear();
		this.callbackUrls.clear();
		this.connected = false;
		console.log("[webhook] Disconnected");
	}

	async send(conversationId: string, message: OutboundMessage): Promise<SentMessage> {
		// Check if there's a pending sync response for this conversation
		const pending = this.pendingResponses.get(conversationId);
		if (pending) {
			clearTimeout(pending.timer);
			pending.resolve(message.text);
			this.pendingResponses.delete(conversationId);
		}

		// Check if there's an async callback URL
		const callbackUrl = this.callbackUrls.get(conversationId);
		if (callbackUrl) {
			await this.sendCallback(callbackUrl, conversationId, message.text);
			this.callbackUrls.delete(conversationId);
		}

		return {
			id: randomUUID(),
			channelId: this.id,
			conversationId,
			timestamp: new Date(),
		};
	}

	onMessage(handler: (message: InboundMessage) => Promise<void>): void {
		this.messageHandler = handler;
	}

	isConnected(): boolean {
		return this.connected;
	}

	/**
	 * Handle an incoming webhook request.
	 * Called from the HTTP server's /webhook route.
	 */
	async handleRequest(req: Request): Promise<Response> {
		if (req.method !== "POST") {
			return Response.json({ status: "error", message: "Method not allowed" }, { status: 405 });
		}

		let body: string;
		let payload: WebhookPayload;

		try {
			body = await req.text();
			payload = JSON.parse(body) as WebhookPayload;
		} catch {
			return Response.json({ status: "error", message: "Invalid JSON" }, { status: 400 });
		}

		// Validate required fields
		if (!payload.message || !payload.conversation_id || !payload.timestamp || !payload.signature) {
			return Response.json(
				{ status: "error", message: "Missing required fields: message, conversation_id, timestamp, signature" },
				{ status: 400 },
			);
		}

		// Verify signature
		if (!this.verifySignature(body, String(payload.timestamp), payload.signature)) {
			return Response.json({ status: "error", message: "Invalid signature" }, { status: 401 });
		}

		// Verify timestamp freshness (5 minute window)
		const now = Date.now();
		const age = Math.abs(now - payload.timestamp);
		if (age > 5 * 60 * 1000) {
			return Response.json({ status: "error", message: "Timestamp too old" }, { status: 401 });
		}

		if (!this.messageHandler) {
			return Response.json({ status: "error", message: "No message handler configured" }, { status: 503 });
		}

		const conversationId = `webhook:${payload.conversation_id}`;

		const inbound: InboundMessage = {
			id: randomUUID(),
			channelId: this.id,
			conversationId,
			senderId: payload.user_id ?? "webhook",
			text: payload.message,
			timestamp: new Date(payload.timestamp),
			metadata: payload.metadata,
		};

		// Async mode: return immediately, send response to callback URL
		if (payload.callback_url) {
			const validation = isSafeCallbackUrl(payload.callback_url);
			if (!validation.safe) {
				return Response.json(
					{ status: "error", message: `Invalid callback URL: ${validation.reason}` },
					{ status: 400 },
				);
			}
			const taskId = randomUUID();
			this.callbackUrls.set(conversationId, payload.callback_url);

			// Fire and forget
			void this.messageHandler(inbound).catch((err: unknown) => {
				const msg = err instanceof Error ? err.message : String(err);
				console.error(`[webhook] Error handling async message: ${msg}`);
			});

			return Response.json({ status: "accepted", task_id: taskId } satisfies WebhookResponse);
		}

		// Sync mode: wait for the response
		const timeoutMs = this.config.syncTimeoutMs ?? 25_000;
		const responseText = await this.waitForResponse(conversationId, inbound, timeoutMs);

		if (responseText === null) {
			return Response.json({ status: "error", message: "Response timeout" } satisfies WebhookResponse, { status: 504 });
		}

		return Response.json({
			status: "ok",
			response: responseText,
		} satisfies WebhookResponse);
	}

	private async waitForResponse(
		conversationId: string,
		inbound: InboundMessage,
		timeoutMs: number,
	): Promise<string | null> {
		return new Promise<string | null>((resolve) => {
			const timer = setTimeout(() => {
				this.pendingResponses.delete(conversationId);
				resolve(null);
			}, timeoutMs);

			this.pendingResponses.set(conversationId, {
				resolve: (text: string) => resolve(text),
				timer,
			});

			// Process the message (will call send() which resolves the promise)
			void this.messageHandler?.(inbound).catch((err: unknown) => {
				clearTimeout(timer);
				this.pendingResponses.delete(conversationId);
				const msg = err instanceof Error ? err.message : String(err);
				console.error(`[webhook] Error handling sync message: ${msg}`);
				resolve(null);
			});
		});
	}

	private async sendCallback(url: string, conversationId: string, text: string): Promise<void> {
		try {
			await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					conversation_id: conversationId.replace("webhook:", ""),
					status: "complete",
					response: text,
				}),
			});
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`[webhook] Failed to send callback to ${url}: ${msg}`);
		}
	}

	private verifySignature(body: string, timestamp: string, signature: string): boolean {
		const payload = `${timestamp}.${body}`;
		const hmac = new Bun.CryptoHasher("sha256", this.config.secret);
		hmac.update(payload);
		const expected = hmac.digest("hex");

		try {
			return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
		} catch {
			return false;
		}
	}
}

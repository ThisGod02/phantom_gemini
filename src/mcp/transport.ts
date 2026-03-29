import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { AuthResult } from "./types.ts";

type SessionEntry = {
	transport: WebStandardStreamableHTTPServerTransport;
	clientName: string;
	createdAt: number;
};

export class McpTransportManager {
	private sessions = new Map<string, SessionEntry>();
	private serverFactory: () => McpServer;

	constructor(serverFactory: () => McpServer) {
		this.serverFactory = serverFactory;
	}

	async handleRequest(req: Request, auth: AuthResult): Promise<Response> {
		if (!auth.authenticated) {
			return jsonRpcError(-32001, auth.error, null, 401);
		}

		const method = req.method.toUpperCase();
		if (method !== "POST" && method !== "GET" && method !== "DELETE") {
			return new Response("Method not allowed", { status: 405 });
		}

		const sessionId = req.headers.get("mcp-session-id") ?? undefined;

		// Existing session
		if (sessionId && this.sessions.has(sessionId)) {
			const entry = this.sessions.get(sessionId);
			if (entry) return entry.transport.handleRequest(req);
		}

		// New session via initialize request
		if (method === "POST") {
			let body: unknown;
			try {
				body = await req.json();
			} catch {
				return jsonRpcError(-32700, "Parse error: invalid JSON", null, 400);
			}

			if (!sessionId && isInitializeRequest(body)) {
				return this.createSession(req, body, auth);
			}

			// POST without session and not initialize
			if (!sessionId) {
				return jsonRpcError(-32000, "Missing Mcp-Session-Id header. Send an initialize request first.", null, 400);
			}

			// Unknown session ID
			return jsonRpcError(-32000, "Unknown session. It may have expired.", null, 400);
		}

		// GET/DELETE without valid session
		return jsonRpcError(-32000, "Invalid or missing session", null, 400);
	}

	private async createSession(req: Request, body: unknown, auth: AuthResult): Promise<Response> {
		const clientName = auth.authenticated ? auth.clientName : "unknown";

		const transport = new WebStandardStreamableHTTPServerTransport({
			sessionIdGenerator: () => randomUUID(),
			onsessioninitialized: (id) => {
				this.sessions.set(id, { transport, clientName, createdAt: Date.now() });
				console.log(`[mcp] Session created: ${id} (client: ${clientName})`);
			},
			enableJsonResponse: true,
		});

		transport.onclose = () => {
			if (transport.sessionId) {
				this.sessions.delete(transport.sessionId);
				console.log(`[mcp] Session closed: ${transport.sessionId}`);
			}
		};

		const server = this.serverFactory();
		await server.connect(transport);

		return transport.handleRequest(req, { parsedBody: body });
	}

	getSessionCount(): number {
		return this.sessions.size;
	}

	getSessionClients(): string[] {
		return Array.from(this.sessions.values()).map((s) => s.clientName);
	}

	// Clean up sessions idle for longer than maxIdleMs (default 30 min)
	cleanupStaleSessions(maxIdleMs = 1_800_000): number {
		const now = Date.now();
		let cleaned = 0;
		for (const [id, entry] of this.sessions) {
			if (now - entry.createdAt > maxIdleMs) {
				entry.transport.close();
				this.sessions.delete(id);
				cleaned++;
			}
		}
		return cleaned;
	}

	async closeAll(): Promise<void> {
		for (const [, entry] of this.sessions) {
			await entry.transport.close();
		}
		this.sessions.clear();
	}
}

function jsonRpcError(code: number, message: string, id: unknown, httpStatus: number): Response {
	return Response.json(
		{ jsonrpc: "2.0", error: { code, message }, id },
		{ status: httpStatus, headers: { "Content-Type": "application/json" } },
	);
}

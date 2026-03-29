import type { Database } from "bun:sqlite";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { AgentRuntime } from "../agent/runtime.ts";
import type { PhantomConfig } from "../config/types.ts";
import type { EvolutionEngine } from "../evolution/engine.ts";
import type { MemorySystem } from "../memory/system.ts";

export type ToolDependencies = {
	config: PhantomConfig;
	db: Database;
	startedAt: number;
	runtime: AgentRuntime;
	memory: MemorySystem | null;
	evolution: EvolutionEngine | null;
};

export function registerUniversalTools(server: McpServer, deps: ToolDependencies): void {
	registerPhantomStatus(server, deps);
	registerPhantomConfig(server, deps);
	registerPhantomMetrics(server, deps);
	registerPhantomHistory(server, deps);
	registerPhantomMemoryQuery(server, deps);
	registerPhantomAsk(server, deps);
	registerPhantomTaskCreate(server, deps);
	registerPhantomTaskStatus(server, deps);
}

function registerPhantomStatus(server: McpServer, deps: ToolDependencies): void {
	server.registerTool(
		"phantom_status",
		{
			description:
				"Get the Phantom's current operational status including state, uptime, cost tracking, queue depth, and evolution generation.",
			inputSchema: z.object({}),
		},
		async (): Promise<CallToolResult> => {
			const uptimeSeconds = Math.floor((Date.now() - deps.startedAt) / 1000);
			const activeSessions = deps.runtime.getActiveSessionCount();
			const generation = deps.evolution?.getCurrentVersion() ?? 0;

			const costRow = deps.db
				.query("SELECT COALESCE(SUM(cost_usd), 0) as total FROM cost_events WHERE created_at >= date('now')")
				.get() as { total: number } | null;

			const queueRow = deps.db
				.query("SELECT COUNT(*) as count FROM tasks WHERE status IN ('queued', 'active')")
				.get() as { count: number } | null;

			const status = {
				state: activeSessions > 0 ? "working" : "idle",
				currentTask: null,
				queueDepth: queueRow?.count ?? 0,
				activeSessions,
				uptimeHours: +(uptimeSeconds / 3600).toFixed(2),
				costToday: +(costRow?.total ?? 0).toFixed(4),
				evolutionGeneration: generation,
			};

			return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
		},
	);
}

function registerPhantomConfig(server: McpServer, deps: ToolDependencies): void {
	server.registerTool(
		"phantom_config",
		{
			description:
				"Read the Phantom's current evolved configuration including persona, strategies, and domain knowledge.",
			inputSchema: z.object({
				section: z.string().optional().describe("Specific section to read (persona, strategies, domain, constitution)"),
			}),
		},
		async ({ section }): Promise<CallToolResult> => {
			if (!deps.evolution) {
				return { content: [{ type: "text", text: JSON.stringify({ error: "Evolution engine not available" }) }] };
			}

			const config = deps.evolution.getConfig();
			const generation = deps.evolution.getCurrentVersion();

			if (section) {
				const sectionMap: Record<string, string> = {
					persona: config.persona,
					constitution: config.constitution,
					domain: config.domainKnowledge,
					strategies: JSON.stringify(config.strategies, null, 2),
					user_profile: config.userProfile,
				};
				const value = sectionMap[section];
				if (!value) {
					return {
						content: [
							{ type: "text", text: `Unknown section: ${section}. Available: ${Object.keys(sectionMap).join(", ")}` },
						],
					};
				}
				return { content: [{ type: "text", text: JSON.stringify({ section, content: value, generation }, null, 2) }] };
			}

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								config: {
									persona: config.persona,
									constitution: config.constitution.slice(0, 500) + (config.constitution.length > 500 ? "..." : ""),
									domainKnowledge:
										config.domainKnowledge.slice(0, 500) + (config.domainKnowledge.length > 500 ? "..." : ""),
									strategies: config.strategies,
								},
								generation,
								lastEvolved: config.meta.metricsSnapshot,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);
}

function registerPhantomMetrics(server: McpServer, deps: ToolDependencies): void {
	server.registerTool(
		"phantom_metrics",
		{
			description: "Performance metrics, evolution stats, success rates, and cost tracking.",
			inputSchema: z.object({
				period: z.enum(["today", "week", "month", "all"]).optional().default("all").describe("Time period for metrics"),
			}),
		},
		async ({ period }): Promise<CallToolResult> => {
			const metrics = deps.evolution?.getMetrics();

			const dateFilter =
				period === "today"
					? "date('now')"
					: period === "week"
						? "date('now', '-7 days')"
						: period === "month"
							? "date('now', '-30 days')"
							: "date('1970-01-01')";

			const costRow = deps.db
				.query(
					`SELECT COALESCE(SUM(cost_usd), 0) as total, COUNT(*) as count FROM cost_events WHERE created_at >= ${dateFilter}`,
				)
				.get() as { total: number; count: number } | null;

			const result = {
				totalTasks: metrics?.session_count ?? 0,
				successRate: metrics ? +(metrics.success_rate_7d * 100).toFixed(1) : 0,
				avgCost: costRow && costRow.count > 0 ? +(costRow.total / costRow.count).toFixed(4) : 0,
				totalCost: +(costRow?.total ?? 0).toFixed(4),
				evolutionGeneration: deps.evolution?.getCurrentVersion() ?? 0,
				evolutionCount: metrics?.evolution_count ?? 0,
				rollbackCount: metrics?.rollback_count ?? 0,
				correctionRate: metrics ? +(metrics.correction_rate_7d * 100).toFixed(1) : 0,
				period,
			};

			return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
		},
	);
}

function registerPhantomHistory(server: McpServer, deps: ToolDependencies): void {
	server.registerTool(
		"phantom_history",
		{
			description: "Get recent session history with outcomes, costs, and durations.",
			inputSchema: z.object({
				limit: z.number().int().min(1).max(100).optional().default(10).describe("Number of sessions to return"),
			}),
		},
		async ({ limit }): Promise<CallToolResult> => {
			const sessions = deps.db
				.query(
					`SELECT session_key, sdk_session_id, channel_id, conversation_id, status,
				 total_cost_usd, input_tokens, output_tokens, turn_count, created_at, last_active_at
				 FROM sessions ORDER BY last_active_at DESC LIMIT ?`,
				)
				.all(limit);

			return { content: [{ type: "text", text: JSON.stringify({ sessions, count: sessions.length }, null, 2) }] };
		},
	);
}

function registerPhantomMemoryQuery(server: McpServer, deps: ToolDependencies): void {
	server.registerTool(
		"phantom_memory_query",
		{
			description:
				"Search the Phantom's persistent memory for knowledge on a topic. Returns relevant episodic, semantic, and procedural memories.",
			inputSchema: z.object({
				query: z.string().min(1).describe("The search query"),
				memory_type: z
					.enum(["episodic", "semantic", "procedural", "all"])
					.optional()
					.default("all")
					.describe("Type of memory to search"),
				limit: z.number().int().min(1).max(50).optional().default(10).describe("Maximum results"),
			}),
		},
		async ({ query, memory_type, limit }): Promise<CallToolResult> => {
			if (!deps.memory || !deps.memory.isReady()) {
				return {
					content: [{ type: "text", text: JSON.stringify({ error: "Memory system not available", results: [] }) }],
				};
			}

			const results: Record<string, unknown[]> = {};

			if (memory_type === "all" || memory_type === "episodic") {
				results.episodes = await deps.memory.recallEpisodes(query, { limit }).catch(() => []);
			}
			if (memory_type === "all" || memory_type === "semantic") {
				results.facts = await deps.memory.recallFacts(query, { limit }).catch(() => []);
			}
			if (memory_type === "all" || memory_type === "procedural") {
				const proc = await deps.memory.findProcedure(query).catch(() => null);
				results.procedures = proc ? [proc] : [];
			}

			const totalMatches = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);
			return { content: [{ type: "text", text: JSON.stringify({ results, totalMatches }, null, 2) }] };
		},
	);
}

function registerPhantomAsk(server: McpServer, deps: ToolDependencies): void {
	server.registerTool(
		"phantom_ask",
		{
			description:
				"Send a question to the Phantom and receive a thoughtful response. The Phantom uses its full context, memory, and tools to answer.",
			inputSchema: z.object({
				message: z.string().min(1).describe("The question or request"),
				urgency: z.enum(["low", "normal", "high"]).optional().default("normal").describe("Priority level"),
			}),
		},
		async ({ message, urgency: _urgency }): Promise<CallToolResult> => {
			try {
				const response = await deps.runtime.handleMessage("mcp", `ask-${Date.now()}`, message);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									response: response.text,
									cost: response.cost.totalUsd,
									durationMs: response.durationMs,
								},
								null,
								2,
							),
						},
					],
				};
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				return { content: [{ type: "text", text: JSON.stringify({ error: msg }) }], isError: true };
			}
		},
	);
}

function registerPhantomTaskCreate(server: McpServer, deps: ToolDependencies): void {
	server.registerTool(
		"phantom_task_create",
		{
			description:
				"Assign a new task to the Phantom. It will be queued and processed based on urgency and current workload.",
			inputSchema: z.object({
				title: z.string().min(1).describe("Short task title"),
				description: z.string().min(1).describe("Detailed task description"),
				urgency: z.enum(["low", "normal", "high"]).optional().default("normal").describe("Task priority"),
			}),
		},
		async ({ title, description, urgency }): Promise<CallToolResult> => {
			const id = crypto.randomUUID();

			deps.db.run(
				`INSERT INTO tasks (id, title, description, urgency, source_channel, status)
			 VALUES (?, ?, ?, ?, 'mcp', 'queued')`,
				[id, title, description, urgency],
			);

			const queueRow = deps.db.query("SELECT COUNT(*) as count FROM tasks WHERE status = 'queued'").get() as {
				count: number;
			};

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								taskId: id,
								status: "queued",
								queuePosition: queueRow.count,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);
}

function registerPhantomTaskStatus(server: McpServer, deps: ToolDependencies): void {
	server.registerTool(
		"phantom_task_status",
		{
			description: "Check the status of a previously assigned task.",
			inputSchema: z.object({
				taskId: z.string().min(1).describe("The task ID returned from phantom_task_create"),
			}),
		},
		async ({ taskId }): Promise<CallToolResult> => {
			const task = deps.db.query("SELECT * FROM tasks WHERE id = ?").get(taskId) as Record<string, unknown> | null;

			if (!task) {
				return { content: [{ type: "text", text: JSON.stringify({ error: "Task not found" }) }], isError: true };
			}

			return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
		},
	);
}

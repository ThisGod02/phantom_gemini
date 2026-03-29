import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { DynamicToolRegistry } from "./dynamic-tools.ts";

export function registerDynamicToolManagementTools(server: McpServer, registry: DynamicToolRegistry): void {
	registerPhantomRegisterTool(server, registry);
	registerPhantomUnregisterTool(server, registry);
	registerPhantomListDynamicTools(server, registry);
}

function registerPhantomRegisterTool(server: McpServer, registry: DynamicToolRegistry): void {
	server.registerTool(
		"phantom_register_tool",
		{
			description:
				"Register a new dynamic MCP tool. The tool is persisted and survives restarts. " +
				"For shell handlers, provide handler_code with a bash command. " +
				"For script handlers, provide handler_path with a path to a script file. " +
				"Tool input is available via the TOOL_INPUT environment variable (JSON string).",
			inputSchema: z.object({
				name: z.string().min(1).describe("Tool name (lowercase, underscores, starts with letter)"),
				description: z.string().min(1).describe("What the tool does"),
				input_schema: z
					.record(z.unknown())
					.default({})
					.describe('Input parameter definitions, e.g. {"name": "string", "count": "number"}'),
				handler_type: z.enum(["script", "shell"]).default("shell").describe("How the tool executes"),
				handler_code: z.string().optional().describe("For shell: the bash command to execute"),
				handler_path: z.string().optional().describe("For script: path to the script file"),
			}),
		},
		async (input): Promise<CallToolResult> => {
			try {
				const def = registry.register(input);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									registered: true,
									name: def.name,
									description: def.description,
									handlerType: def.handlerType,
									note: "Tool registered. New MCP sessions will include this tool. Existing sessions need to reconnect.",
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

function registerPhantomUnregisterTool(server: McpServer, registry: DynamicToolRegistry): void {
	server.registerTool(
		"phantom_unregister_tool",
		{
			description: "Remove a previously registered dynamic tool. Built-in tools cannot be removed.",
			inputSchema: z.object({
				name: z.string().min(1).describe("Name of the tool to remove"),
			}),
		},
		async ({ name }): Promise<CallToolResult> => {
			if (name.startsWith("phantom_") && !registry.has(name)) {
				return {
					content: [
						{ type: "text", text: JSON.stringify({ error: `'${name}' is a built-in tool and cannot be removed` }) },
					],
					isError: true,
				};
			}

			const removed = registry.unregister(name);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({
							removed,
							name,
							note: removed ? "Tool removed. New MCP sessions will not include this tool." : "Tool not found.",
						}),
					},
				],
			};
		},
	);
}

function registerPhantomListDynamicTools(server: McpServer, registry: DynamicToolRegistry): void {
	server.registerTool(
		"phantom_list_dynamic_tools",
		{
			description: "List all dynamically registered tools.",
			inputSchema: z.object({}),
		},
		async (): Promise<CallToolResult> => {
			const tools = registry.getAll();
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								count: tools.length,
								tools: tools.map((t) => ({
									name: t.name,
									description: t.description,
									handlerType: t.handlerType,
								})),
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

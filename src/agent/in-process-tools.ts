import type { FunctionDeclaration } from "@google/genai";
import { Type } from "@google/genai";
import { z } from "zod";
import type { DynamicToolRegistry } from "../mcp/dynamic-tools.ts";

export const dynamicToolDeclarations: FunctionDeclaration[] = [
	{
		name: "phantom_register_tool",
		description:
			"Register a new dynamic MCP tool. The tool is persisted and survives restarts. " +
			"For shell handlers, provide handler_code with a bash command. " +
			"For script handlers, provide handler_path with a path to a script file. " +
			"Tool input is available via the TOOL_INPUT environment variable (JSON string).",
		parameters: {
			type: Type.OBJECT,
			properties: {
				name: { type: Type.STRING, description: "Tool name (lowercase, underscores, starts with letter)" },
				description: { type: Type.STRING, description: "What the tool does" },
				input_schema: { type: Type.STRING, description: 'JSON of input parameter definitions, e.g. {"name": "string"}' },
				handler_type: { type: Type.STRING, description: "shell or script" },
				handler_code: { type: Type.STRING, description: "For shell: the bash command to execute" },
				handler_path: { type: Type.STRING, description: "For script: path to the script file" },
			},
			required: ["name", "description", "handler_type"],
		},
	},
	{
		name: "phantom_unregister_tool",
		description: "Remove a previously registered dynamic tool. Built-in tools cannot be removed.",
		parameters: {
			type: Type.OBJECT,
			properties: {
				name: { type: Type.STRING, description: "Name of the tool to remove" },
			},
			required: ["name"],
		},
	},
	{
		name: "phantom_list_dynamic_tools",
		description: "List all dynamically registered tools.",
		parameters: { type: Type.OBJECT, properties: {} },
	},
];

const RegisterSchema = z.object({
	name: z.string().min(1),
	description: z.string().min(1),
	input_schema: z.string().optional(),
	handler_type: z.enum(["script", "shell"]).default("shell"),
	handler_code: z.string().optional(),
	handler_path: z.string().optional(),
});

export async function handleDynamicToolCall(
	toolName: string,
	args: Record<string, unknown>,
	registry: DynamicToolRegistry,
): Promise<unknown> {
	if (toolName === "phantom_register_tool") {
		const input = RegisterSchema.parse(args);
		const parsedSchema = input.input_schema ? JSON.parse(input.input_schema) : {};
		const def = registry.register({ ...input, input_schema: parsedSchema });
		return { registered: true, name: def.name, description: def.description, handlerType: def.handlerType };
	}

	if (toolName === "phantom_unregister_tool") {
		const name = args.name as string;
		const removed = registry.unregister(name);
		return { removed, name };
	}

	if (toolName === "phantom_list_dynamic_tools") {
		const tools = registry.getAll();
		return {
			count: tools.length,
			tools: tools.map((t) => ({ name: t.name, description: t.description, handlerType: t.handlerType })),
		};
	}

	throw new Error(`Unknown dynamic tool: ${toolName}`);
}

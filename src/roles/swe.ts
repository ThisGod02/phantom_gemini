import type { RoleModule } from "./types.ts";

/**
 * SWE role module. Provides metadata about the SWE role's custom tool handlers.
 * The actual tool implementations live in src/mcp/tools-swe.ts since they need
 * direct McpServer access. This module serves as the registration point for
 * the role system to know the SWE role has custom tools.
 */
export const sweModule: RoleModule = {
	// SWE tools are registered via registerSweTools() in tools-swe.ts
	// This module exists so the role registry knows the SWE role has a TS module
	tools: [],
};

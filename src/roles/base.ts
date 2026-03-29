import type { RoleModule } from "./types.ts";

/**
 * Base role module. The base role has no custom tools - it uses only
 * the universal MCP tools. This module exists as a reference implementation
 * showing the minimum a role module needs.
 */
export const baseModule: RoleModule = {
	tools: [],
};

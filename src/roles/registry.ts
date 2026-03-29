import { listAvailableRoles, loadRoleFromYaml } from "./loader.ts";
import type { EvolutionFocus, OnboardingQuestion, RoleModule, RoleTemplate, RoleToolRegistration } from "./types.ts";

const BASE_ROLE_ID = "base";

export class RoleRegistry {
	private roles = new Map<string, RoleTemplate>();
	private modules = new Map<string, RoleModule>();

	register(template: RoleTemplate, module?: RoleModule): void {
		this.roles.set(template.id, template);
		if (module) {
			this.modules.set(template.id, module);
		}
	}

	get(roleId: string): RoleTemplate | null {
		return this.roles.get(roleId) ?? null;
	}

	getOrThrow(roleId: string): RoleTemplate {
		const role = this.roles.get(roleId);
		if (!role) {
			const available = this.list().join(", ");
			throw new Error(`Role '${roleId}' not found. Available roles: ${available}`);
		}
		return role;
	}

	getModule(roleId: string): RoleModule | null {
		return this.modules.get(roleId) ?? null;
	}

	getTools(roleId: string): RoleToolRegistration[] {
		const mod = this.modules.get(roleId);
		return mod?.tools ?? [];
	}

	list(): string[] {
		return Array.from(this.roles.keys());
	}

	listDetailed(): Array<{ id: string; name: string; description: string; toolCount: number }> {
		return Array.from(this.roles.values()).map((r) => ({
			id: r.id,
			name: r.name,
			description: r.description,
			toolCount: r.mcp_tools.length + (this.modules.get(r.id)?.tools?.length ?? 0),
		}));
	}

	getOnboardingQuestions(roleId: string): OnboardingQuestion[] {
		const role = this.roles.get(roleId);
		return role?.onboarding_questions ?? [];
	}

	getEvolutionFocus(roleId: string): EvolutionFocus | null {
		const role = this.roles.get(roleId);
		return role?.evolution_focus ?? null;
	}

	has(roleId: string): boolean {
		return this.roles.has(roleId);
	}

	getBaseRole(): RoleTemplate {
		const base = this.roles.get(BASE_ROLE_ID);
		if (!base) {
			throw new Error("Base role not registered. Call loadAllRoles() first.");
		}
		return base;
	}
}

/**
 * Load all YAML role configs from the config/roles/ directory and register them.
 * Also loads corresponding TypeScript modules from src/roles/ if they exist.
 */
export function loadAllRoles(registry: RoleRegistry, configDir?: string): void {
	const available = listAvailableRoles(configDir);

	for (const roleId of available) {
		try {
			const template = loadRoleFromYaml(roleId, configDir);
			registry.register(template);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			console.warn(`[roles] Failed to load role '${roleId}': ${msg}`);
		}
	}
}

/**
 * Load a single role by ID and register it, including its TypeScript module.
 */
export function loadRole(registry: RoleRegistry, roleId: string, configDir?: string): RoleTemplate {
	const template = loadRoleFromYaml(roleId, configDir);
	registry.register(template);
	return template;
}

/**
 * Create a pre-populated registry with all available roles.
 */
export function createRoleRegistry(configDir?: string): RoleRegistry {
	const registry = new RoleRegistry();
	loadAllRoles(registry, configDir);
	return registry;
}

import type { RoleTemplate } from "../roles/types.ts";
import type { OwnerProfile } from "./profiler.ts";

function buildOwnerContext(profile: OwnerProfile): string {
	const lines: string[] = [];
	lines.push("## Owner Context");
	lines.push("");
	lines.push(`You are being set up for ${profile.name}${profile.title ? `, ${profile.title}` : ""}.`);

	if (profile.teamName) {
		lines.push(`The workspace is called "${profile.teamName}".`);
	}
	if (profile.isOwner) {
		lines.push("They are the workspace owner (founder or primary admin).");
	} else if (profile.isAdmin) {
		lines.push("They are a workspace admin.");
	}
	if (profile.timezone) {
		lines.push(`They are in ${profile.timezone}.`);
	}
	if (profile.status) {
		lines.push(`Their current status: "${profile.status}"`);
	}
	if (profile.channels.length > 0) {
		lines.push(`They are active in these channels: ${profile.channels.join(", ")}`);
	}

	lines.push("");
	lines.push("Use this context naturally. Do not list all this information back to them.");
	lines.push("Let it inform how you engage with their work.");

	return lines.join("\n");
}

/**
 * Build the system prompt section injected when the agent is onboarding.
 * Role-agnostic: the agent follows the user's lead instead of running
 * through a predefined checklist. Cardinal Rule applies here too.
 */
export function buildOnboardingPrompt(_role: RoleTemplate, phantomName: string, ownerProfile?: OwnerProfile): string {
	const ownerSection = ownerProfile ? `\n\n${buildOwnerContext(ownerProfile)}` : "";
	const ownerName = ownerProfile?.name ?? "your user";

	return `## Onboarding Mode

This is your first real conversation with ${ownerName}. You are ${phantomName}.${ownerSection}

Your goal: understand their work well enough to be immediately useful.
Not "onboard them through a checklist." Understand their work.

Have a natural conversation. Listen to what they tell you. Ask follow-up
questions based on what they say, not from a predefined list.

When they mention tools, repos, or services:
- Clone repos yourself (git clone into ~/repos/)
- Read the code, configs, READMEs. Figure out the stack.
- If they work with code, explore the repo and understand the architecture.
- If they work with data, ask about data sources and formats.
- If they work with customers, ask about their CRM and workflow.
- If they work with content, ask about their publishing process.
- If they manage people, ask about their team and priorities.

You have full computer access: Bash, Read, Write, Edit, Glob, Grep, WebSearch.
Use them. Do not ask the user things you can figure out on your own.

When you have enough context to start being useful:
- Summarize what you learned (brief, specific, no padding)
- Offer to do something concrete based on what they told you
- Do not ask "What should I work on?" Suggest something based on what you learned.

Write what you learn to your config files:
- phantom-config/user-profile.md (who they are, what they do)
- phantom-config/domain-knowledge.md (their stack, tools, context)

Be warm. Be specific. Prove that you were listening by referencing
what they told you, not by listing what you can do.`;
}

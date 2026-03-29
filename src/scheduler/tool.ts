import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Scheduler } from "./service.ts";
import { AtScheduleSchema, CronScheduleSchema, EveryScheduleSchema, JobDeliverySchema } from "./types.ts";

const ScheduleInputSchema = z.discriminatedUnion("kind", [AtScheduleSchema, EveryScheduleSchema, CronScheduleSchema]);

function ok(data: Record<string, unknown>): { content: Array<{ type: "text"; text: string }> } {
	return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(message: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
	return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true };
}

export function createSchedulerToolServer(scheduler: Scheduler): McpSdkServerConfigWithInstance {
	const scheduleTool = tool(
		"phantom_schedule",
		`Create, list, delete, or trigger scheduled tasks. This lets you set up recurring jobs, one-shot reminders, and automated reports.

ACTIONS:
- create: Create a new scheduled task. Returns the job ID and next run time.
- list: List all scheduled tasks with their status and next run time.
- delete: Remove a scheduled task by job ID or name.
- run: Trigger a task immediately for testing. Returns the task output.

SCHEDULE TYPES:
- "at": One-shot at a specific time. { kind: "at", at: "2026-03-26T09:00:00-07:00" }
- "every": Recurring interval in ms. { kind: "every", intervalMs: 1800000 } (30 minutes)
- "cron": Cron expression with timezone. { kind: "cron", expr: "0 9 * * 1-5", tz: "America/Los_Angeles" }

DELIVERY:
- { channel: "slack", target: "owner" } - DM the configured owner (default)
- { channel: "slack", target: "U04ABC123" } - DM a specific Slack user
- { channel: "slack", target: "C04ABC123" } - Post to a Slack channel
- { channel: "none" } - Silent (no delivery, useful for maintenance tasks)

When creating a task, write the task prompt as a complete, self-contained instruction.
Include all necessary context in the task text. The scheduled run will NOT have access
to the current conversation.`,
		{
			action: z.enum(["create", "list", "delete", "run"]),
			name: z.string().optional().describe("Job name (required for create)"),
			description: z.string().optional().describe("Job description"),
			schedule: ScheduleInputSchema.optional().describe("Schedule definition (required for create)"),
			task: z.string().optional().describe("The prompt for the agent when the job fires (required for create)"),
			delivery: JobDeliverySchema.optional().describe("Where to deliver results"),
			jobId: z.string().optional().describe("Job ID (for delete or run)"),
		},
		async (input) => {
			try {
				switch (input.action) {
					case "create": {
						if (!input.name) return err("name is required for create");
						if (!input.schedule) return err("schedule is required for create");
						if (!input.task) return err("task is required for create");

						const job = scheduler.createJob({
							name: input.name,
							description: input.description,
							schedule: input.schedule,
							task: input.task,
							delivery: input.delivery,
							deleteAfterRun: input.schedule.kind === "at",
						});

						return ok({
							created: true,
							id: job.id,
							name: job.name,
							schedule: job.schedule,
							nextRunAt: job.nextRunAt,
							delivery: job.delivery,
						});
					}

					case "list": {
						const jobs = scheduler.listJobs();
						return ok({
							count: jobs.length,
							jobs: jobs.map((j) => ({
								id: j.id,
								name: j.name,
								description: j.description,
								enabled: j.enabled,
								schedule: j.schedule,
								status: j.status,
								nextRunAt: j.nextRunAt,
								lastRunAt: j.lastRunAt,
								lastRunStatus: j.lastRunStatus,
								runCount: j.runCount,
								delivery: j.delivery,
							})),
						});
					}

					case "delete": {
						const targetId = input.jobId ?? findJobIdByName(scheduler, input.name);
						if (!targetId) return err("Provide jobId or name to delete");

						const deleted = scheduler.deleteJob(targetId);
						return ok({ deleted, id: targetId });
					}

					case "run": {
						const targetId = input.jobId ?? findJobIdByName(scheduler, input.name);
						if (!targetId) return err("Provide jobId or name to run");

						const result = await scheduler.runJobNow(targetId);
						return ok({ triggered: true, id: targetId, result });
					}

					default:
						return err(`Unknown action: ${input.action}`);
				}
			} catch (error: unknown) {
				const msg = error instanceof Error ? error.message : String(error);
				return err(msg);
			}
		},
	);

	return createSdkMcpServer({
		name: "phantom-scheduler",
		tools: [scheduleTool],
	});
}

function findJobIdByName(scheduler: Scheduler, name: string | undefined): string | undefined {
	if (!name) return undefined;
	const jobs = scheduler.listJobs();
	const lowerName = name.toLowerCase();
	const match = jobs.find((j) => j.name.toLowerCase() === lowerName);
	return match?.id;
}

import type { FunctionDeclaration } from "@google/genai";
import { Type } from "@google/genai";
import { z } from "zod";
import type { Scheduler } from "./service.ts";
import { AtScheduleSchema, CronScheduleSchema, EveryScheduleSchema, JobDeliverySchema } from "./types.ts";

const ScheduleInputSchema = z.discriminatedUnion("kind", [AtScheduleSchema, EveryScheduleSchema, CronScheduleSchema]);

export const schedulerDeclarations: FunctionDeclaration[] = [
	{
		name: "phantom_schedule",
		description: `Create, list, delete, or trigger scheduled tasks. This lets you set up recurring jobs, one-shot reminders, and automated reports.

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
- { channel: "none" } - Silent (no delivery, useful for maintenance tasks)`,
		parameters: {
			type: Type.OBJECT,
			properties: {
				action: { type: Type.STRING, description: "create | list | delete | run" },
				name: { type: Type.STRING, description: "Job name (required for create)" },
				description: { type: Type.STRING, description: "Job description" },
				schedule: { type: Type.STRING, description: "JSON schedule definition (required for create)" },
				task: { type: Type.STRING, description: "The prompt for the agent when the job fires (required for create)" },
				delivery: { type: Type.STRING, description: "JSON delivery config" },
				jobId: { type: Type.STRING, description: "Job ID (for delete or run)" },
			},
			required: ["action"],
		},
	},
];

export async function handleSchedulerToolCall(
	toolName: string,
	args: Record<string, unknown>,
	scheduler: Scheduler,
): Promise<unknown> {
	if (toolName !== "phantom_schedule") throw new Error(`Unknown scheduler tool: ${toolName}`);

	const action = args.action as string;

	switch (action) {
		case "create": {
			if (!args.name) return { error: "name is required for create" };
			if (!args.schedule) return { error: "schedule is required for create" };
			if (!args.task) return { error: "task is required for create" };

			const schedule = ScheduleInputSchema.parse(
				typeof args.schedule === "string" ? JSON.parse(args.schedule) : args.schedule,
			);
			const delivery = args.delivery
				? JobDeliverySchema.parse(typeof args.delivery === "string" ? JSON.parse(args.delivery) : args.delivery)
				: undefined;

			const job = scheduler.createJob({
				name: args.name as string,
				description: args.description as string | undefined,
				schedule,
				task: args.task as string,
				delivery,
				deleteAfterRun: schedule.kind === "at",
			});

			return { created: true, id: job.id, name: job.name, schedule: job.schedule, nextRunAt: job.nextRunAt };
		}
		case "list": {
			const jobs = scheduler.listJobs();
			return {
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
				})),
			};
		}
		case "delete": {
			const targetId = (args.jobId as string | undefined) ?? findJobIdByName(scheduler, args.name as string | undefined);
			if (!targetId) return { error: "Provide jobId or name to delete" };
			const deleted = scheduler.deleteJob(targetId);
			return { deleted, id: targetId };
		}
		case "run": {
			const targetId = (args.jobId as string | undefined) ?? findJobIdByName(scheduler, args.name as string | undefined);
			if (!targetId) return { error: "Provide jobId or name to run" };
			const result = await scheduler.runJobNow(targetId);
			return { triggered: true, id: targetId, result };
		}
		default:
			return { error: `Unknown action: ${action}` };
	}
}

function findJobIdByName(scheduler: Scheduler, name: string | undefined): string | undefined {
	if (!name) return undefined;
	const jobs = scheduler.listJobs();
	return jobs.find((j) => j.name.toLowerCase() === name.toLowerCase())?.id;
}

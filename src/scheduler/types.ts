import { z } from "zod";

export const ScheduleKindSchema = z.enum(["at", "every", "cron"]);
export type ScheduleKind = z.infer<typeof ScheduleKindSchema>;

export const AtScheduleSchema = z.object({
	kind: z.literal("at"),
	at: z.string().describe("ISO 8601 timestamp"),
});

export const EveryScheduleSchema = z.object({
	kind: z.literal("every"),
	intervalMs: z.number().int().positive().describe("Interval in milliseconds"),
});

export const CronScheduleSchema = z.object({
	kind: z.literal("cron"),
	expr: z.string().describe("Cron expression (5 fields)"),
	tz: z.string().optional().describe("IANA timezone, e.g. America/Los_Angeles"),
});

export const ScheduleSchema = z.discriminatedUnion("kind", [AtScheduleSchema, EveryScheduleSchema, CronScheduleSchema]);
export type Schedule = z.infer<typeof ScheduleSchema>;

export const JobDeliverySchema = z.object({
	channel: z.enum(["slack", "none"]).default("slack"),
	target: z.string().default("owner").describe('"owner" or a specific Slack user/channel ID'),
});
export type JobDelivery = z.infer<typeof JobDeliverySchema>;

export type JobStatus = "active" | "paused" | "completed" | "failed";
export type RunStatus = "ok" | "error" | "skipped";

export type ScheduledJob = {
	id: string;
	name: string;
	description: string | null;
	enabled: boolean;
	schedule: Schedule;
	task: string;
	delivery: JobDelivery;
	status: JobStatus;
	lastRunAt: string | null;
	lastRunStatus: RunStatus | null;
	lastRunDurationMs: number | null;
	lastRunError: string | null;
	nextRunAt: string | null;
	runCount: number;
	consecutiveErrors: number;
	deleteAfterRun: boolean;
	createdAt: string;
	createdBy: string;
	updatedAt: string;
};

export type JobCreateInput = {
	name: string;
	description?: string;
	schedule: Schedule;
	task: string;
	delivery?: JobDelivery;
	deleteAfterRun?: boolean;
	createdBy?: string;
};

export type JobRow = {
	id: string;
	name: string;
	description: string | null;
	enabled: number;
	schedule_kind: string;
	schedule_value: string;
	task: string;
	delivery_channel: string;
	delivery_target: string;
	status: string;
	last_run_at: string | null;
	last_run_status: string | null;
	last_run_duration_ms: number | null;
	last_run_error: string | null;
	next_run_at: string | null;
	run_count: number;
	consecutive_errors: number;
	delete_after_run: number;
	created_at: string;
	created_by: string;
	updated_at: string;
};

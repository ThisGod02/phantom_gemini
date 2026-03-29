export type McpScope = "read" | "operator" | "admin";

export type TokenConfig = {
	name: string;
	hash: string;
	scopes: McpScope[];
};

export type RateLimitConfig = {
	requests_per_minute: number;
	burst: number;
};

export type McpConfig = {
	tokens: TokenConfig[];
	rate_limit: RateLimitConfig;
};

export type AuthResult =
	| { authenticated: true; clientName: string; scopes: McpScope[] }
	| { authenticated: false; error: string };

export type AuditEntry = {
	id?: number;
	timestamp: string;
	client_name: string;
	method: string;
	tool_name: string | null;
	resource_uri: string | null;
	input_summary: string | null;
	output_summary: string | null;
	cost_usd: number;
	duration_ms: number;
	status: "success" | "error";
};

export type TaskRow = {
	id: string;
	title: string;
	description: string;
	status: "queued" | "active" | "completed" | "failed";
	urgency: "low" | "normal" | "high";
	source_channel: string | null;
	source_client: string | null;
	result: string | null;
	cost_usd: number;
	created_at: string;
	started_at: string | null;
	completed_at: string | null;
};

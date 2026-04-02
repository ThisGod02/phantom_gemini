import type { FunctionDeclaration } from "@google/genai";
import { Type } from "@google/genai";

type EmailToolDeps = {
	agentName: string;
	domain: string;
	dailyLimit: number;
};

// In-memory daily counter. Resets on restart and when the date changes.
let sentToday = 0;
let lastResetDate = new Date().toDateString();

function checkDailyLimit(limit: number): { allowed: boolean; remaining: number } {
	const today = new Date().toDateString();
	if (today !== lastResetDate) {
		sentToday = 0;
		lastResetDate = today;
	}
	return { allowed: sentToday < limit, remaining: Math.max(0, limit - sentToday) };
}

export function createEmailDeclarations(deps: EmailToolDeps): FunctionDeclaration[] {
	const fromAddress = `${deps.agentName}@${deps.domain}`;
	return [
		{
			name: "phantom_send_email",
			description: `Send an email from ${fromAddress}. Use this to send reports, summaries, notifications, or any email to your owner or other recipients. The from address is fixed - you always send as yourself. Rate limit: ${deps.dailyLimit} emails per day.`,
			parameters: {
				type: Type.OBJECT,
				properties: {
					to: { type: Type.STRING, description: "Recipient email address(es), comma-separated. Max 50." },
					subject: { type: Type.STRING, description: "Email subject line" },
					text: { type: Type.STRING, description: "Plain text body of the email" },
					html: { type: Type.STRING, description: "Optional HTML body. If omitted, plain text is used." },
					cc: { type: Type.STRING, description: "CC recipients, comma-separated" },
					bcc: { type: Type.STRING, description: "BCC recipients, comma-separated" },
					reply_to: { type: Type.STRING, description: "Reply-to address" },
				},
				required: ["to", "subject", "text"],
			},
		},
	];
}

export async function handleEmailToolCall(
	toolName: string,
	args: Record<string, unknown>,
	deps: EmailToolDeps,
): Promise<unknown> {
	if (toolName !== "phantom_send_email") throw new Error(`Unknown email tool: ${toolName}`);

	const rateCheck = checkDailyLimit(deps.dailyLimit);
	if (!rateCheck.allowed) return { error: `Daily email limit reached (${deps.dailyLimit}). Resets at midnight.` };

	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) return { error: "Email not configured. RESEND_API_KEY is not set." };

	const fromAddress = `${deps.agentName}@${deps.domain}`;
	const toList = (args.to as string).split(",").map((s) => s.trim());
	const ccList = args.cc ? (args.cc as string).split(",").map((s) => s.trim()) : undefined;
	const bccList = args.bcc ? (args.bcc as string).split(",").map((s) => s.trim()) : undefined;

	const { Resend } = await import("resend");
	const resend = new Resend(apiKey);

	const { data, error } = await resend.emails.send({
		from: `${deps.agentName} <${fromAddress}>`,
		to: toList,
		subject: args.subject as string,
		text: args.text as string,
		html: args.html as string | undefined,
		cc: ccList,
		bcc: bccList,
		replyTo: args.reply_to as string | undefined,
	});

	if (error) return { error: error.message };

	sentToday++;
	return {
		sent: true,
		id: data?.id,
		from: fromAddress,
		to: args.to,
		subject: args.subject,
		remaining: deps.dailyLimit - sentToday,
	};
}

import { parseArgs } from "node:util";

export async function runStart(args: string[]): Promise<void> {
	const { values } = parseArgs({
		args,
		options: {
			help: { type: "boolean", short: "h" },
			port: { type: "string", short: "p" },
			config: { type: "string", short: "c" },
			daemon: { type: "boolean", short: "d" },
		},
		allowPositionals: false,
	});

	if (values.help) {
		console.log("phantom start - Start the Phantom agent\n");
		console.log("Usage: phantom start [options]\n");
		console.log("Options:");
		console.log("  -p, --port <port>     Override HTTP port");
		console.log("  -c, --config <path>   Path to phantom.yaml");
		console.log("  -d, --daemon          Run in background (detached)");
		console.log("  -h, --help            Show this help");
		return;
	}

	if (values.daemon) {
		await startDaemon(values.port, values.config);
		return;
	}

	// Set overrides as environment variables so the main process reads them
	if (values.port) {
		process.env.PHANTOM_PORT_OVERRIDE = values.port;
	}
	if (values.config) {
		process.env.PHANTOM_CONFIG_PATH = values.config;
	}

	// Import and run main directly
	await import("../index.ts");
}

async function startDaemon(port?: string, config?: string): Promise<void> {
	const args = ["run", "src/index.ts"];
	const env: Record<string, string> = { ...process.env } as Record<string, string>;

	if (port) env.PHANTOM_PORT_OVERRIDE = port;
	if (config) env.PHANTOM_CONFIG_PATH = config;

	const proc = Bun.spawn(["bun", ...args], {
		env,
		stdio: ["ignore", "ignore", "ignore"],
	});

	// Detach from the parent process
	proc.unref();

	console.log(`Phantom started in background (PID: ${proc.pid})`);
	console.log("Check status: phantom status");
	console.log("View logs: phantom start (foreground) or check systemd journal");
}

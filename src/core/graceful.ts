type ShutdownTask = {
	name: string;
	fn: () => Promise<void>;
};

const tasks: ShutdownTask[] = [];
let shuttingDown = false;

export function onShutdown(name: string, fn: () => Promise<void>): void {
	tasks.push({ name, fn });
}

export function installShutdownHandlers(): void {
	const handler = () => {
		if (shuttingDown) return;
		shuttingDown = true;
		runShutdown();
	};

	process.on("SIGINT", handler);
	process.on("SIGTERM", handler);
}

async function runShutdown(): Promise<void> {
	console.log("\n[phantom] Shutting down...");

	for (const task of tasks.reverse()) {
		try {
			await task.fn();
			console.log(`[phantom] Stopped: ${task.name}`);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`[phantom] Error stopping ${task.name}: ${msg}`);
		}
	}

	console.log("[phantom] Goodbye.");
	process.exit(0);
}

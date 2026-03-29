#!/usr/bin/env bun
import { runCli } from "./index.ts";

runCli(process.argv).catch((err: unknown) => {
	const msg = err instanceof Error ? err.message : String(err);
	console.error(`phantom: ${msg}`);
	process.exit(1);
});

import { spawn } from "node:child_process";

/**
 * runLogin initiates the Google Account (OAuth) sign-in flow.
 * It leverages the official @google/gemini-cli's login command.
 */
export async function runLogin(_args: string[]): Promise<void> {
	console.log("\nStarting Google Account sign-in (OAuth Device Flow)...");
	console.log("This will allow Phantom to use your account's high limits (Gemini Advanced/GCA).\n");

	// Use current runtime (bun/node) to run the CLI directly from node_modules if possible.
	// This avoids issues where npx/bunx might delegate to an old system Node version.
	const localBundle = "node_modules/@google/gemini-cli/bundle/gemini.js";
	const exe = process.argv[0]; // 'bun' or 'node'
	
	const shell = process.platform === "win32" ? "cmd" : undefined;
	let args: string[];
	
	if (process.platform === "win32") {
		// On Windows, running with cmd /c
		args = ["/c", exe, localBundle, "login"];
	} else {
		// On Linux, run directly
		args = [localBundle, "login"];
	}

	const child = spawn(shell || exe, args, {
		stdio: "inherit",
		shell: true,
	});

	return new Promise((resolve, reject) => {
		child.on("close", (code) => {
			if (code === 0) {
				console.log("\nSuccessfully signed in! Your credentials are now cached.");
				console.log("To use high-limit mode, ensure PHANTOM_PROVIDER=gemini-cli in your .env");
				resolve();
			} else {
				console.error(`\nLogin failed with exit code ${code}.`);
				reject(new Error(`Login failed with exit code ${code}`));
			}
		});

		child.on("error", (err) => {
			console.error("\nFailed to start login process:", err.message);
			reject(err);
		});
	});
}

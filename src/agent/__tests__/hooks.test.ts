import { describe, expect, test } from "bun:test";
import { checkDangerousCommand } from "../tools/bash.ts";

describe("checkDangerousCommand", () => {
	test("blocks rm -rf /", () => {
		const result = checkDangerousCommand("rm -rf /");
		expect(result).toBe("rm -rf /");
	});

	test("blocks git push --force", () => {
		const result = checkDangerousCommand("git push --force origin main");
		expect(result).toBe("git push --force");
	});

	test("blocks docker system prune", () => {
		const result = checkDangerousCommand("docker system prune -af");
		expect(result).toBe("docker system prune");
	});

	test("blocks rm -rf /home", () => {
		const result = checkDangerousCommand("rm -rf /home");
		expect(result).toBe("rm -rf /home");
	});

	test("blocks mkfs commands", () => {
		const result = checkDangerousCommand("mkfs.ext4 /dev/sda1");
		expect(result).toBe("mkfs (format filesystem)");
	});

	test("blocks dd to device", () => {
		const result = checkDangerousCommand("dd if=/dev/zero of=/dev/sda");
		expect(result).toBe("dd to device");
	});

	test("allows safe commands", () => {
		const result = checkDangerousCommand("ls -la");
		expect(result).toBeNull();
	});
});

import { spawnSync } from "node:child_process";
import type { FunctionDeclaration } from "@google/genai";
import { Type } from "@google/genai";

// Эти паттерны проверяются ПЕРЕД каждым запуском команды.
// Если совпадает — команда блокируется, агент получает ошибку и может выбрать другой путь.
// Это не security-граница (опытный злоумышленник обойдёт), а защита от случайных ошибок (defense-in-depth).
const DANGEROUS_PATTERNS: { pattern: RegExp; label: string }[] = [
	{ pattern: /docker\s+compose\s+down/, label: "docker compose down" },
	{ pattern: /docker\s+volume\s+prune/, label: "docker volume prune" },
	{ pattern: /docker\s+system\s+prune/, label: "docker system prune" },
	{ pattern: /git\s+push\s+.*--force/, label: "git push --force" },
	{ pattern: /git\s+reset\s+--hard/, label: "git reset --hard" },
	{ pattern: /rm\s+-rf\s+\/(\s|$)/, label: "rm -rf /" },
	{ pattern: /rm\s+-rf\s+\/home(\s|$)/, label: "rm -rf /home" },
	{ pattern: /rm\s+-rf\s+\/etc(\s|$)/, label: "rm -rf /etc" },
	{ pattern: /rm\s+-rf\s+\/var(\s|$)/, label: "rm -rf /var" },
	{ pattern: /mkfs\./, label: "mkfs (format filesystem)" },
	{ pattern: /dd\s+.*of=\/dev\//, label: "dd to device" },
	{ pattern: /systemctl\s+(stop|disable)\s+phantom/, label: "stop phantom service" },
	{ pattern: /kill\s+-9\s+1(\s|$)/, label: "kill init" },
];

/**
 * Проверяет команду на опасные паттерны.
 * Возвращает label заблокированной команды или null если безопасна.
 */
export function checkDangerousCommand(command: string): string | null {
	for (const { pattern, label } of DANGEROUS_PATTERNS) {
		if (pattern.test(command)) return label;
	}
	return null;
}

/**
 * Выполняет bash-команду и возвращает stdout + stderr.
 * Таймаут: 5 минут по умолчанию.
 */
export function executeBash(command: string, timeoutMs = 300_000): { stdout: string; stderr: string; exitCode: number } {
	const result = spawnSync("bash", ["-c", command], {
		timeout: timeoutMs,
		maxBuffer: 10 * 1024 * 1024, // 10 MB
		encoding: "utf-8",
	});

	return {
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		exitCode: result.status ?? 1,
	};
}

/**
 * FunctionDeclaration для регистрации в Gemini.
 * Вызов выполняется в runtime.ts с проверкой блокировщика.
 */
export const bashDeclaration: FunctionDeclaration = {
	name: "Bash",
	description:
		"Execute a bash command in the shell. Returns stdout, stderr, and exit code. " +
		"Use for running scripts, installing packages, git operations, building projects, " +
		"checking system state, and any other shell operations. " +
		"For long-running commands, prefer backgrounding with & and checking output files.",
	parameters: {
		type: Type.OBJECT,
		properties: {
			command: {
				type: Type.STRING,
				description: "The bash command to execute",
			},
			timeout_ms: {
				type: Type.NUMBER,
				description: "Optional timeout in milliseconds (default: 300000 = 5 minutes)",
			},
		},
		required: ["command"],
	},
};

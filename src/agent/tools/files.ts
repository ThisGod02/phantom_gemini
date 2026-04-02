import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { FunctionDeclaration } from "@google/genai";
import { Type } from "@google/genai";

/** Безопасное чтение файла. */
export function readFile(filePath: string): { content: string; error?: string } {
	try {
		const content = readFileSync(filePath, "utf-8");
		return { content };
	} catch (err: unknown) {
		return { content: "", error: err instanceof Error ? err.message : String(err) };
	}
}

/** Запись файла — создаёт директории если нужно. */
export function writeFile(filePath: string, content: string): { success: boolean; error?: string } {
	try {
		const dir = dirname(resolve(filePath));
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
		writeFileSync(filePath, content, "utf-8");
		return { success: true };
	} catch (err: unknown) {
		return { success: false, error: err instanceof Error ? err.message : String(err) };
	}
}

/** Листинг директории с базовой информацией о файлах. */
export function listDirectory(dirPath: string, maxDepth = 2): { entries: unknown[]; error?: string } {
	try {
		const entries = listRecursive(dirPath, maxDepth, 0);
		return { entries };
	} catch (err: unknown) {
		return { entries: [], error: err instanceof Error ? err.message : String(err) };
	}
}

function listRecursive(
	dirPath: string,
	maxDepth: number,
	currentDepth: number,
): { name: string; type: "file" | "dir"; size?: number; children?: unknown[] }[] {
	const items = readdirSync(dirPath);
	return items.map((name) => {
		const fullPath = resolve(dirPath, name);
		try {
			const stat = statSync(fullPath);
			if (stat.isDirectory()) {
				return {
					name,
					type: "dir" as const,
					children: currentDepth < maxDepth ? listRecursive(fullPath, maxDepth, currentDepth + 1) : [],
				};
			}
			return { name, type: "file" as const, size: stat.size };
		} catch {
			return { name, type: "file" as const };
		}
	});
}

export const readFileDeclaration: FunctionDeclaration = {
	name: "Read",
	description:
		"Read the contents of a file. Returns the full text content. " +
		"Use for reading source code, config files, logs, or any text file.",
	parameters: {
		type: Type.OBJECT,
		properties: {
			file_path: {
				type: Type.STRING,
				description: "Absolute or relative path to the file to read",
			},
		},
		required: ["file_path"],
	},
};

export const writeFileDeclaration: FunctionDeclaration = {
	name: "Write",
	description:
		"Write content to a file. Creates the file and any parent directories if they don't exist. " +
		"Overwrites existing content. Use for creating or updating files.",
	parameters: {
		type: Type.OBJECT,
		properties: {
			file_path: {
				type: Type.STRING,
				description: "Absolute or relative path to the file to write",
			},
			content: {
				type: Type.STRING,
				description: "The content to write to the file",
			},
		},
		required: ["file_path", "content"],
	},
};

export const listDirDeclaration: FunctionDeclaration = {
	name: "LS",
	description: "List the contents of a directory. Returns files and subdirectories with their sizes.",
	parameters: {
		type: Type.OBJECT,
		properties: {
			path: {
				type: Type.STRING,
				description: "Path to the directory to list",
			},
			max_depth: {
				type: Type.NUMBER,
				description: "Maximum directory depth to recurse (default: 2)",
			},
		},
		required: ["path"],
	},
};

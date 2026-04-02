import type { FunctionDeclaration, Tool } from "@google/genai";
import { bashDeclaration } from "./bash.ts";
import { listDirDeclaration, readFileDeclaration, writeFileDeclaration } from "./files.ts";

/** Все нативные инструменты агента (bash + файловая система). */
export const nativeDeclarations: FunctionDeclaration[] = [
	bashDeclaration,
	readFileDeclaration,
	writeFileDeclaration,
	listDirDeclaration,
];

/** Готовый объект Tool для передачи в Gemini generateContent. */
export const nativeTool: Tool = {
	functionDeclarations: nativeDeclarations,
};

export { checkDangerousCommand, executeBash } from "./bash.ts";
export { listDirectory, readFile, writeFile } from "./files.ts";

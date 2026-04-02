/**
 * Логика хуков перенесена напрямую в runtime.ts (диспатч tool-calls в ручном loop).
 * Этот файл оставлен для обратной совместимости с тестами.
 *
 * Defense-in-depth command blocker теперь живёт в src/agent/tools/bash.ts.
 * File tracker реализован прямо в AgentRuntime.dispatchToolCall().
 */

export { checkDangerousCommand } from "./tools/bash.ts";

import type { z } from "zod";
import type { MemoryConfigSchema, PhantomConfigSchema } from "./schemas.ts";

export type PhantomConfig = z.infer<typeof PhantomConfigSchema>;
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;

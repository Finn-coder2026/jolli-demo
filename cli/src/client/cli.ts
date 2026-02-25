// Jolli CLI
// Usage: bun src/client/cli.ts [command]
//
// Commands:
//   init    - Initialize directory: login (if needed) and select a space
//   auth    - Authentication commands (login, logout, status, space)
//   sync    - Sync markdown files with the server
//   agent   - Interactive LLM agent with local tool execution
//   source  - Manage source mappings for impact analysis

import {
	registerAgentCommands,
	registerAuthCommands,
	registerImpactCommands,
	registerInitCommand,
	registerSourceCommands,
	registerSyncCommands,
} from "./commands";
import { Command } from "commander";

// =============================================================================
// SECTION: CLI Setup
// =============================================================================

const program = new Command();
program.name("jolli").description("Jolli CLI tool").version("0.0.1");

// Register command modules
registerInitCommand(program);
registerAuthCommands(program);
registerSyncCommands(program);
registerAgentCommands(program);
registerImpactCommands(program);
registerSourceCommands(program);

// =============================================================================
// SECTION: Re-exports (for backward compatibility and tests)
// =============================================================================

export type { PullChange, PushOp } from "../reference-server/types";
// Sync module re-exports
export type {
	ConflictInfo,
	FileEntry,
	FileScanner,
	FingerprintStrategy,
	MergeResult,
	MergeStrategy,
	PathObfuscator,
	SyncConfig,
	SyncMode,
	SyncState,
} from "../sync";
export { conflictMarkerStrategy, extractJrn, injectJrn, removeJrnFromContent } from "../sync";
export type { ToolHost, ToolHostConfig, ToolResult } from "./commands/AgentToolHost";
export { createToolHost } from "./commands/AgentToolHost";
// Agent exports
export type {
	AgentSession,
	AgentSessionConfig,
	ClientMessage,
	ServerMessage,
	ToolManifest,
	ToolManifestEntry,
} from "./commands/agent";
export {
	CLIENT_VERSION,
	createDefaultToolManifest,
	getWorkspaceRoot,
} from "./commands/agent";
export {
	generateId,
	hashFingerprint,
	keepBothStrategy,
	matchesAnyGlob,
	parseYamlFrontmatter,
	parseYamlList,
	passthroughObfuscator,
	purgeSnapshots,
	recursiveScanner,
	renameFile,
	sync,
	toYamlFrontmatter,
} from "./commands/sync";

// =============================================================================
// SECTION: Main
// =============================================================================

if (import.meta.main) {
	program.parse();
}

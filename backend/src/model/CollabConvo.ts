import type { ModelDef } from "../util/ModelDef";
import type { AgentHubMetadata, CollabMessageRole } from "jolli-common";
import { DataTypes, type Sequelize } from "sequelize";

export type ArtifactType = "doc_draft" | "cli_workspace" | "agent_hub";

/**
 * Agent mode for CLI workspace conversations.
 * - "general": Default interactive assistant mode
 * - "impact": Documentation update mode for impact agent
 */
export type AgentMode = "general" | "impact";

/**
 * Context for impact agent mode.
 * Provides information about the article to update and the code changes.
 */
export interface ImpactContext {
	readonly article: {
		readonly path: string;
		readonly jrn: string;
	};
	readonly changes: ReadonlyArray<{
		readonly path: string;
		readonly status: "added" | "modified" | "deleted" | "renamed";
		readonly diff: string;
	}>;
	readonly commits: ReadonlyArray<{
		readonly sha: string;
		readonly message: string;
	}>;
	readonly evidence: ReadonlyArray<{
		readonly changedFile: string;
		readonly pattern: string;
		readonly matchType: "exact" | "glob";
		readonly source: string;
	}>;
}

/**
 * Metadata for CLI workspace artifacts.
 * Stores workspace root, tool manifest, and client version info.
 */
export interface CliWorkspaceMetadata {
	readonly workspaceRoot?: string;
	readonly toolManifest?: {
		readonly tools: ReadonlyArray<{
			readonly name: string;
			readonly description: string;
			readonly inputSchema: Record<string, unknown>;
		}>;
	};
	readonly clientVersion?: string;
	readonly sources?: ReadonlyArray<{
		readonly name: string;
		readonly path: string;
		readonly sourceId?: number;
	}>;
	readonly agentMode?: AgentMode;
	readonly impactContext?: ImpactContext;
}

/**
 * Metadata for collab convos that use E2B sandboxes.
 * Stores sandbox ID for reconnection across Vercel serverless invocations.
 */
export interface CollabConvoMetadata {
	readonly sandboxId?: string;
}

export type StandardCollabMessage = {
	role: Extract<CollabMessageRole, "user" | "assistant" | "system">;
	content: string;
	userId?: number;
	timestamp: string;
};

export type AssistantToolUseCollabMessage = {
	role: Extract<CollabMessageRole, "assistant_tool_use">;
	tool_call_id: string;
	tool_name: string;
	tool_input: unknown;
	userId?: number;
	timestamp: string;
};

export type AssistantToolUsesCollabMessage = {
	role: Extract<CollabMessageRole, "assistant_tool_uses">;
	calls: Array<{ tool_call_id: string; tool_name: string; tool_input: unknown }>;
	userId?: number;
	timestamp: string;
};

export type ToolCollabMessage = {
	role: Extract<CollabMessageRole, "tool">;
	tool_call_id: string;
	content: string;
	tool_name: string;
	userId?: number;
	timestamp: string;
};

export type CollabMessage =
	| StandardCollabMessage
	| AssistantToolUseCollabMessage
	| AssistantToolUsesCollabMessage
	| ToolCollabMessage;

export interface CollabConvo {
	readonly id: number;
	readonly artifactType: ArtifactType;
	readonly artifactId: number | null;
	readonly title: string | null;
	readonly messages: Array<CollabMessage>;
	readonly metadata: CollabConvoMetadata | CliWorkspaceMetadata | AgentHubMetadata | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export type NewCollabConvo = Omit<CollabConvo, "id" | "createdAt" | "updatedAt" | "title"> & {
	readonly title?: string | null;
};

export function defineCollabConvos(sequelize: Sequelize): ModelDef<CollabConvo> {
	const existing = sequelize.models?.collab_convo;
	if (existing) {
		return existing as ModelDef<CollabConvo>;
	}
	return sequelize.define("collab_convo", schema, { timestamps: true });
}

const schema = {
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true,
	},
	artifactType: {
		type: DataTypes.STRING,
		allowNull: false,
	},
	artifactId: {
		type: DataTypes.INTEGER,
		allowNull: true,
	},
	title: {
		type: DataTypes.STRING,
		allowNull: true,
	},
	messages: {
		type: DataTypes.JSONB,
		allowNull: false,
		defaultValue: [],
	},
	metadata: {
		type: DataTypes.JSONB,
		allowNull: true,
		defaultValue: null,
	},
};

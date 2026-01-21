import type { ModelDef } from "../util/ModelDef";
import type { CollabMessageRole } from "jolli-common";
import { DataTypes, type Sequelize } from "sequelize";

export type ArtifactType = "doc_draft";

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
	readonly artifactId: number;
	readonly messages: Array<CollabMessage>;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export type NewCollabConvo = Omit<CollabConvo, "id" | "createdAt" | "updatedAt">;

export function defineCollabConvos(sequelize: Sequelize): ModelDef<CollabConvo> {
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
		allowNull: false,
	},
	messages: {
		type: DataTypes.JSONB,
		allowNull: false,
		defaultValue: [],
	},
};

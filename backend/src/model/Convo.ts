import type { ModelDef } from "../util/ModelDef";
import { DataTypes, type Sequelize } from "sequelize";

export type ChatMessage =
	| {
			role: "user" | "assistant" | "system";
			content: string;
	  }
	| {
			role: "assistant_tool_use";
			tool_call_id: string;
			tool_name: string;
			tool_input: unknown;
	  }
	| {
			role: "assistant_tool_uses";
			calls: Array<{ tool_call_id: string; tool_name: string; tool_input: unknown }>;
	  }
	| {
			role: "tool";
			tool_call_id: string;
			content: string;
			tool_name: string;
	  };

export interface Convo {
	readonly id: number;
	readonly userId: number | undefined;
	readonly visitorId: string | undefined;
	readonly title: string;
	readonly messages: Array<ChatMessage>;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export type NewConvo = Omit<Convo, "id" | "createdAt" | "updatedAt">;

export function defineConvos(sequelize: Sequelize): ModelDef<Convo> {
	return sequelize.define("convo", schema, { timestamps: true });
}

const schema = {
	id: {
		type: DataTypes.INTEGER,
		autoIncrement: true,
		primaryKey: true,
	},
	userId: {
		type: DataTypes.INTEGER,
		allowNull: true,
		references: {
			model: "users",
			key: "id",
		},
	},
	visitorId: {
		type: DataTypes.STRING,
		allowNull: true,
	},
	title: {
		type: DataTypes.STRING,
		allowNull: false,
		defaultValue: "New Conversation",
	},
	messages: {
		type: DataTypes.JSONB,
		allowNull: false,
		defaultValue: [],
	},
};

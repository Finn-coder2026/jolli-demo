import type { CommandDefinition } from "./types";

export const convosCommand: CommandDefinition = {
	name: "/conversations",
	description: "Toggle conversation list view",
	handler: ctx => {
		ctx.setViewMode(prev => (prev === "chat" ? "conversations" : "chat"));
	},
};

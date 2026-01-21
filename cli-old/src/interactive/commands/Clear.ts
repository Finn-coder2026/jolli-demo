import type { CommandDefinition } from "./types";

export const clearCommand: CommandDefinition = {
	name: "/clear",
	description: "Clear the screen",
	handler: ctx => {
		ctx.setMessages([]);
	},
};

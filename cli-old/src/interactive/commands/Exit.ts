import type { CommandDefinition } from "./types";

export const exitCommand: CommandDefinition = {
	name: "/exit",
	description: "Exit interactive mode",
	handler: ctx => {
		ctx.setMessages([]); // Clear the screen
		ctx.setSystemMessage("Goodbye! 👋");
		ctx.setShouldExit(true);
	},
};

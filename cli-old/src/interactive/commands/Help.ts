import type { CommandDefinition } from "./types";

export const helpCommand: CommandDefinition = {
	name: "/help",
	description: "Show this help message",
	handler: (ctx, _args, commands) => {
		if (!commands) {
			ctx.setSystemMessage("No commands available.");
			return;
		}
		const helpText = commands.map(c => `${c.name} - ${c.description}`).join("\n");
		ctx.setSystemMessage(`Available commands:\n\n${helpText}`);
	},
};

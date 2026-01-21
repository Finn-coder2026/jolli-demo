import type { CommandDefinition } from "./types";

export const loginCommand: CommandDefinition = {
	name: "/login",
	description: "Authenticate with your account",
	handler: async ctx => {
		ctx.setSystemMessage("Opening browser for login...");
		try {
			await ctx.onLogin();
			ctx.setSystemMessage("Login successful! Loading conversations...");
			await ctx.reloadConvos();
			ctx.setSystemMessage(null);
		} catch (error) {
			ctx.setSystemMessage(`Login failed: ${String(error)}`);
		}
	},
};

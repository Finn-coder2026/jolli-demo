import type { CommandDefinition } from "./types";

export const adminCommand: CommandDefinition = {
	name: "/admin",
	description: "Access admin utilities (hidden)",
	handler: ctx => {
		ctx.setViewMode("admin");
	},
};

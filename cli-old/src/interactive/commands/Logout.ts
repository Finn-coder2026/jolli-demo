import { clearAuthToken } from "../../util/Config";
import type { CommandDefinition } from "./types";

export const logoutCommand: CommandDefinition = {
	name: "/logout",
	description: "Log out and clear saved authentication",
	handler: async ctx => {
		try {
			await clearAuthToken();
			ctx.setSystemMessage("Logged out successfully. Restart interactive mode to log in again.");
			// Exit after logout since the session is no longer valid
			ctx.setShouldExit(true);
		} catch (error) {
			ctx.setSystemMessage(`Logout failed: ${String(error)}`);
		}
	},
};

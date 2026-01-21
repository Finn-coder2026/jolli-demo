import { adminCommand } from "./Admin";
import { clearCommand } from "./Clear";
import { convosCommand } from "./Convos";
import { exitCommand } from "./Exit";
import { helpCommand } from "./Help";
import { loginCommand } from "./Login";
import { logoutCommand } from "./Logout";
import type { CommandContext, CommandDefinition } from "./types";

export type { CommandContext, CommandDefinition };

// Registry of all available commands (alphabetically sorted)
export const COMMANDS: Array<CommandDefinition> = [
	clearCommand,
	convosCommand,
	exitCommand,
	helpCommand,
	loginCommand,
	logoutCommand,
];

// Hidden commands (not shown in help but still executable)
export const HIDDEN_COMMANDS: Array<CommandDefinition> = [adminCommand];

// Execute a command by name
export async function executeCommand(commandName: string, ctx: CommandContext): Promise<boolean> {
	const cmd = commandName.toLowerCase().trim();

	// Check public commands
	const command = COMMANDS.find(c => c.name === cmd);
	if (command) {
		await command.handler(ctx, undefined, COMMANDS);
		return true;
	}

	// Check hidden commands
	const hiddenCommand = HIDDEN_COMMANDS.find(c => c.name === cmd);
	if (hiddenCommand) {
		await hiddenCommand.handler(ctx, undefined, COMMANDS);
		return true;
	}

	return false;
}

import type { ChatMessage } from "jolli-common";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

export interface CommandContext {
	setMessages: Dispatch<SetStateAction<Array<ChatMessage>>>;
	setSystemMessage: Dispatch<SetStateAction<string | null>>;
	setShouldExit: Dispatch<SetStateAction<boolean>>;
	setViewMode: Dispatch<SetStateAction<string>>;
	onLogin: () => Promise<void>;
	reloadConvos: () => Promise<void>;
	isMountedRef: MutableRefObject<boolean>;
}

export type CommandHandler = (
	ctx: CommandContext,
	args?: string,
	commands?: Array<CommandDefinition>,
) => Promise<void> | void;

export interface CommandDefinition {
	name: string;
	description: string;
	handler: CommandHandler;
}

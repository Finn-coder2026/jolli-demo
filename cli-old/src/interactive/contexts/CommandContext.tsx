import { useCommandSuggestions } from "../hooks/useCommandSuggestions";
import { useMessageInputContext } from "./MessageInputContext";
import type React from "react";
import { createContext, useContext } from "react";

export interface CommandContextValue {
	commandSuggestions: Array<{ name: string; description: string; handler: unknown }>;
	handleCommandSelect: (command: string) => Promise<void>;
}

export const CommandContext = createContext<CommandContextValue | undefined>(undefined);

export function useCommandContext(): CommandContextValue {
	const context = useContext(CommandContext);
	if (!context) {
		throw new Error("useCommandContext must be used within a CommandProvider");
	}
	return context;
}

/**
 * CommandProvider manages command suggestions and selection
 * It filters available commands based on user input and handles command execution
 */
export function CommandProvider({ children }: { children: React.ReactNode }): React.ReactElement {
	const { message, setMessage, handleCommand } = useMessageInputContext();
	const commandSuggestions = useCommandSuggestions(message);

	const handleCommandSelect = async (command: string): Promise<void> => {
		setMessage("");
		await handleCommand(command);
	};

	const value: CommandContextValue = {
		commandSuggestions,
		handleCommandSelect,
	};

	return <CommandContext.Provider value={value}>{children}</CommandContext.Provider>;
}

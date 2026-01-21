import { COMMANDS } from "../commands";
import { useEffect, useState } from "react";

export function useCommandSuggestions(message: string): Array<(typeof COMMANDS)[number]> {
	const [commandSuggestions, setCommandSuggestions] = useState<typeof COMMANDS>([]);

	useEffect(() => {
		if (message.startsWith("/") && message.length > 0) {
			const query = message.toLowerCase();
			const filtered = COMMANDS.filter(cmd => cmd.name.toLowerCase().startsWith(query));
			setCommandSuggestions(filtered);
		} else {
			setCommandSuggestions([]);
		}
	}, [message]);

	return commandSuggestions;
}

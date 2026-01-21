import { useKeyboardShortcuts } from "../hooks";
import { useChatContext } from "./ChatContext";
import {
	AdminProvider,
	ChatProvider,
	ClientProvider,
	CommandProvider,
	ConvoProvider,
	ExitProvider,
	MessageInputProvider,
	SystemProvider,
} from "./index";
import { useMessageInputContext } from "./MessageInputContext";
import { useSystemContext } from "./SystemContext";
import type { Client } from "jolli-common";
import type React from "react";

interface AppProviderProps {
	client: Client;
	onExit: () => void;
	onLogin: () => Promise<void>;
	children: React.ReactNode;
}

/**
 * Internal component that registers keyboard shortcuts
 * Must be inside SystemProvider and ChatProvider to access their contexts
 */
function KeyboardShortcuts({ children }: { children: React.ReactNode }): React.ReactElement {
	const { viewMode, setViewMode } = useSystemContext();
	const { isLoading } = useChatContext();
	const { setMessage } = useMessageInputContext();

	// Callback to clear the last character if it was typed during a keyboard shortcut
	const clearLastChar = (char: string): void => {
		setMessage(prev => {
			// Remove the last character if it matches the shortcut key
			if (prev.endsWith(char)) {
				return prev.slice(0, -1);
			}
			return prev;
		});
	};

	useKeyboardShortcuts(viewMode, setViewMode, isLoading, clearLastChar);

	return <>{children}</>;
}

/**
 * Main AppProvider that wraps the entire application with all necessary contexts
 * Each context provider is self-contained and manages its own state internally
 *
 * Provider nesting order (based on dependencies):
 * - SystemProvider (no dependencies)
 * - ExitProvider (needs onExit)
 * - ClientProvider (needs client, uses ExitContext)
 * - AdminProvider (needs client, uses SystemContext)
 * - ChatProvider (needs client)
 * - ConvoProvider (needs client, uses ChatContext, SystemContext)
 * - MessageInputProvider (needs onLogin, uses ChatContext, ConvoContext, ExitContext, SystemContext)
 * - CommandProvider (uses MessageInputContext)
 */
export function AppProvider({ client, onExit, onLogin, children }: AppProviderProps): React.ReactElement {
	return (
		<SystemProvider>
			<ExitProvider onExit={onExit}>
				<ClientProvider client={client}>
					<AdminProvider>
						<ChatProvider client={client}>
							<ConvoProvider client={client}>
								<MessageInputProvider onLogin={onLogin}>
									<CommandProvider>
										<KeyboardShortcuts>{children}</KeyboardShortcuts>
									</CommandProvider>
								</MessageInputProvider>
							</ConvoProvider>
						</ChatProvider>
					</AdminProvider>
				</ClientProvider>
			</ExitProvider>
		</SystemProvider>
	);
}

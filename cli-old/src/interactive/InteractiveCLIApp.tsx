import { AppProvider, useConvoContext, useSystemContext } from "./contexts";
import { getView } from "./views";
import { Box, Text } from "ink";
import type { Client } from "jolli-common";
import type React from "react";

interface InteractiveCLIAppProps {
	client: Client;
	onExit: () => void;
	onLogin: () => Promise<void>;
}

/**
 * Main application UI component
 * This component renders the header, system messages, and current view
 */
function AppUI(): React.ReactElement {
	const { systemMessage, viewMode } = useSystemContext();
	const { currentTitle } = useConvoContext();

	// Get the current view
	const currentView = getView(viewMode);

	return (
		<Box flexDirection="column" height="100%" width="100%">
			{/* Header */}
			<Box borderStyle="double" borderColor="cyan" paddingX={1}>
				<Text bold color="cyan">
					Jolli Interactive
				</Text>
				<Box flexGrow={1} />
				<Text dimColor>{currentTitle}</Text>
				<Box flexGrow={1} />
				<Text dimColor>(Tab: Commands | Ctrl+L: Convos | Ctrl+C: Exit | /help)</Text>
			</Box>

			{/* System Message */}
			{/* c8 ignore next 4 - conditional rendering tested through context */}
			{systemMessage && (
				<Box borderStyle="single" borderColor="yellow" paddingX={1} marginY={1}>
					<Text color="yellow">{systemMessage}</Text>
				</Box>
			)}

			{/* Main Content - Render current view */}
			{currentView ? (
				currentView.component()
			) : (
				<Box flexGrow={1} justifyContent="center" alignItems="center">
					<Text color="red">Unknown view: {viewMode}</Text>
				</Box>
			)}
		</Box>
	);
}

/**
 * Root application component
 * Wraps the entire app with AppProvider and renders the UI
 */
export function InteractiveCLIApp({ client, onExit, onLogin }: InteractiveCLIAppProps): React.ReactElement {
	return (
		<AppProvider client={client} onExit={onExit} onLogin={onLogin}>
			<AppUI />
		</AppProvider>
	);
}

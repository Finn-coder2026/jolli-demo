import { loadAuthToken } from "../util/Config";
import { browserLogin } from "../util/Login";
import { InteractiveCLIApp } from "./InteractiveCLIApp";
import { render } from "ink";
import type { Client } from "jolli-common";

export async function startInteractiveMode(client: Client, url: string): Promise<void> {
	// Clear the terminal screen before starting interactive mode
	console.clear();

	let shouldExit = false;

	const handleExit = () => {
		shouldExit = true;
	};

	const handleLogin = async () => {
		await browserLogin(url);
		// Reload the auth token and update the client
		const newToken = await loadAuthToken();
		client.auth().setAuthToken(newToken);
	};

	const { unmount, waitUntilExit } = render(
		<InteractiveCLIApp client={client} onExit={handleExit} onLogin={handleLogin} />,
	);

	try {
		await waitUntilExit();
	} finally {
		unmount();
	}

	if (shouldExit) {
		process.exit(0);
	}
}

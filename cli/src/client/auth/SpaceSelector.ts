import readline from "node:readline";

/**
 * Minimal space info returned from the API, used for selection.
 */
interface SpaceInfo {
	readonly id: number;
	readonly name: string;
	readonly slug: string;
}

/**
 * Fetches the list of spaces from the Jolli API.
 * @param authToken Bearer token for authentication.
 * @param baseUrl Base URL of the Jolli server (e.g. http://localhost:8034).
 * @returns Array of spaces ordered by creation date (first = default).
 */
export async function fetchSpaces(authToken: string, baseUrl: string): Promise<Array<SpaceInfo>> {
	const res = await fetch(`${baseUrl}/api/spaces`, {
		headers: {
			Authorization: `Bearer ${authToken}`,
			"Content-Type": "application/json",
		},
	});

	if (!res.ok) {
		throw new Error(`Failed to fetch spaces (${res.status} ${res.statusText})`);
	}

	return (await res.json()) as Array<SpaceInfo>;
}

/**
 * Prompts the user to select a space from a numbered list.
 * The first space is marked as "(default)" and selected when Enter is pressed with no input.
 * @param spaces Array of available spaces.
 * @returns The slug of the selected space.
 */
export function promptSpaceSelection(spaces: ReadonlyArray<SpaceInfo>): Promise<string> {
	return new Promise((resolve, reject) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		console.log("\nSelect a space:");
		for (let i = 0; i < spaces.length; i++) {
			const label = i === 0 ? `${spaces[i].name} (default)` : spaces[i].name;
			console.log(`  ${i + 1}. ${label}`);
		}

		rl.question(`\nSpace [1]: `, answer => {
			rl.close();

			const trimmed = answer.trim();
			// Default to first space when empty
			if (trimmed === "") {
				resolve(spaces[0].slug);
				return;
			}

			const index = Number.parseInt(trimmed, 10);
			if (Number.isNaN(index) || index < 1 || index > spaces.length) {
				reject(new Error(`Invalid selection: "${trimmed}". Expected a number between 1 and ${spaces.length}.`));
				return;
			}

			resolve(spaces[index - 1].slug);
		});
	});
}

/**
 * Fetches spaces from the server and prompts the user to select one.
 * @param authToken Bearer token for authentication.
 * @param baseUrl Base URL of the Jolli server.
 * @returns The slug of the selected space.
 */
export async function selectSpace(authToken: string, baseUrl: string): Promise<string> {
	const spaces = await fetchSpaces(authToken, baseUrl);

	if (spaces.length === 0) {
		throw new Error("No spaces available. Please create a space in the Jolli web UI first.");
	}

	// If only one space, auto-select it
	if (spaces.length === 1) {
		console.log(`\nUsing space: ${spaces[0].name}`);
		return spaces[0].slug;
	}

	return promptSpaceSelection(spaces);
}

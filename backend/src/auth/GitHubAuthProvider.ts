import { getConfig } from "../config/Config";
import type { NewAuth } from "../model/Auth";
import type { AuthProvider } from "./AuthProvider";

export function createGitHubAuthProvider(): AuthProvider {
	return {
		url: "https://api.github.com/user",
		createConfig,
		getSelectedEmail,
		getVerifiedEmails,
		newAuth,
	};

	function createConfig(): Record<string, unknown> | undefined {
		const config = getConfig();
		if (config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET) {
			return {
				key: config.GITHUB_CLIENT_ID,
				secret: config.GITHUB_CLIENT_SECRET,
				scope: ["user:email"],
			};
		}
	}

	function getSelectedEmail(): undefined {
		return void 0;
	}

	async function getVerifiedEmails(accessToken: string): Promise<Array<string>> {
		const response = await fetch("https://api.github.com/user/emails", {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"User-Agent": "Jolli",
			},
		});

		if (!response.ok) {
			return [];
		}

		return (await response.json())
			.filter((email: Record<string, unknown>) => email.verified)
			.map((email: Record<string, unknown>) => String(email.email));
	}

	function newAuth(data: Record<string, unknown>, email: string): NewAuth {
		return {
			provider: "github",
			subject: data.id ? String(data.id) : String(data.node_id),
			email,
			name: data.name ? String(data.name) : String(data.login),
			picture: data.avatar_url ? String(data.avatar_url) : undefined,
		};
	}
}

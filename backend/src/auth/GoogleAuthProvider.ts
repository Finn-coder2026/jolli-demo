import { getConfig } from "../config/Config";
import type { NewAuth } from "../model/Auth";
import type { AuthProvider } from "./AuthProvider";

export function createGoogleAuthProvider(): AuthProvider {
	return {
		url: "https://www.googleapis.com/oauth2/v2/userinfo",
		createConfig,
		getSelectedEmail,
		getVerifiedEmails,
		newAuth,
	};

	function createConfig(): Record<string, unknown> | undefined {
		const config = getConfig();
		if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET) {
			return {
				key: config.GOOGLE_CLIENT_ID,
				secret: config.GOOGLE_CLIENT_SECRET,
				scope: ["openid", "email", "profile"],
			};
		}
	}

	function getSelectedEmail(data: Record<string, unknown>): string {
		return String(data.email);
	}

	function getVerifiedEmails(): Promise<Array<string>> {
		return Promise.resolve([]);
	}

	function newAuth(data: Record<string, unknown>, email: string): NewAuth {
		return {
			provider: "google",
			subject: String(data.id),
			email,
			name: String(data.name),
			picture: data.picture ? String(data.picture) : undefined,
		};
	}
}

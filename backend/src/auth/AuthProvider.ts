import type { NewAuth } from "../model/Auth";
import { createGitHubAuthProvider } from "./GitHubAuthProvider";
import { createGoogleAuthProvider } from "./GoogleAuthProvider";

export interface AuthProvider {
	readonly url: string;
	createConfig(): Record<string, unknown> | undefined;
	getSelectedEmail(data: Record<string, unknown>): string | undefined;
	getVerifiedEmails(accessToken: string): Promise<Array<string>>;
	newAuth(data: Record<string, unknown>, email: string): NewAuth;
}

const authProviders: Record<string, AuthProvider> = {
	github: createGitHubAuthProvider(),
	google: createGoogleAuthProvider(),
};

export function findAuthProvider(provider: string | undefined): AuthProvider | undefined {
	return provider ? authProviders[provider] : undefined;
}

export function createGrantConfig(origin: string, enableDynamic = false) {
	const config: Record<string, unknown> = {
		defaults: {
			origin,
			transport: "session",
			state: true,
			callback: "/api/auth/callback",
		},
	};

	for (const [name, provider] of Object.entries(authProviders)) {
		const providerConfig = provider.createConfig();
		if (providerConfig) {
			config[name] = {
				...providerConfig,
				redirect_uri: `${origin}/connect/${name}/callback`,
				// Allow dynamic override of origin and redirect_uri either in development when USE_GATEWAY is true
				// OR multi-tenant auth is enabled (gateway needs dynamic redirect)
				...(enableDynamic && { dynamic: ["origin", "redirect_uri"] }),
			};
		}
	}

	return config;
}

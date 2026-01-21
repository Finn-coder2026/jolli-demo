import type { AuthClient } from "./AuthClient";

export function mockAuthClient(partial?: Partial<AuthClient>): AuthClient {
	return {
		getCliToken: async () => "mock-cli-token",
		setAuthToken: () => {
			/* mock function */
		},
		getEmails: async () => ["test@example.com"],
		selectEmail: async () => ({}),
		getSessionConfig: async () => ({
			idleTimeoutMs: 3600000,
			enabledProviders: ["github", "google"],
			siteEnv: "prod",
			jolliSiteDomain: "jolli.site",
		}),
		...partial,
	};
}

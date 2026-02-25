import type { AuthClient } from "./AuthClient";

export function mockAuthClient(partial?: Partial<AuthClient>): AuthClient {
	return {
		getCliToken: async () => ({ token: "mock-cli-token", space: "default" }),
		setAuthToken: () => {
			/* mock function */
		},
		getSessionConfig: async () => ({
			idleTimeoutMs: 3600000,
			enabledProviders: ["github", "google"],
			siteEnv: "prod",
			jolliSiteDomain: "jolli.site",
			cookieDomain: ".jolli.app",
		}),
		selectTenant: async () => ({ success: true, url: "http://localhost:8034/dashboard" }),
		...partial,
	};
}

import { getConfig } from "../config/Config";
import { createAppAuth } from "@octokit/auth-app";
import { throttling } from "@octokit/plugin-throttling";
import { Octokit } from "@octokit/rest";

export function createOctokit(): Octokit {
	const config = getConfig();
	const MyOctokit = Octokit.plugin ? Octokit.plugin(throttling) : Octokit;
	return new MyOctokit({
		auth: config.GITHUB_TOKEN,
		throttle: {
			onRateLimit: (_retryAfter, _options, _octokit, _retryCount) => true,
			onSecondaryRateLimit: (_retryAfter, _options, _octokit, _retryCount) => true,
		},
	});
}

export function createOctokitForAppInstallation(
	app: { appId: number; privateKey: string },
	installationId: number,
): Octokit {
	const { appId, privateKey } = app;
	const MyOctokit = Octokit.plugin ? Octokit.plugin(throttling) : Octokit;
	return new MyOctokit({
		authStrategy: createAppAuth,
		auth: {
			appId,
			privateKey,
			installationId,
		},
		throttle: {
			onRateLimit: (_retryAfter, _options, _octokit, _retryCount) => true,
			onSecondaryRateLimit: (_retryAfter, _options, _octokit, _retryCount) => true,
		},
	});
}

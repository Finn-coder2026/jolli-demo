import { getConfig } from "../config/Config";

export interface GitHubApp {
	readonly appId: number;
	readonly slug: string;
	readonly clientId: string;
	readonly clientSecret: string;
	readonly webhookSecret: string;
	readonly privateKey: string;
	readonly name: string;
	readonly htmlUrl: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function getCoreJolliGithubApp(): GitHubApp {
	const coreJolliAppInfo = getConfig().GITHUB_APPS_INFO;
	const now = new Date();
	return coreJolliAppInfo
		? {
				appId: coreJolliAppInfo.app_id,
				slug: coreJolliAppInfo.slug,
				clientId: coreJolliAppInfo.client_id,
				clientSecret: coreJolliAppInfo.client_secret,
				webhookSecret: coreJolliAppInfo.webhook_secret,
				privateKey: coreJolliAppInfo.private_key,
				name: coreJolliAppInfo.name,
				htmlUrl: coreJolliAppInfo.html_url,
				createdAt: now,
				updatedAt: now,
			}
		: {
				appId: -1,
				slug: "",
				clientId: "",
				clientSecret: "",
				webhookSecret: "",
				privateKey: "",
				name: "",
				htmlUrl: "",
				createdAt: now,
				updatedAt: now,
			};
}

/**
 * Vercel serverless function entry point.
 * This file is bundled into api/index.js by build-serverless.js.
 */

import { createExpressApp } from "./AppFactory";
import { getOIDCTokenProvider } from "./util/OIDCTokenProvider";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Express } from "express";

let app: Express | null = null;
let appPromise: Promise<Express> | null = null;

/**
 * Gets or creates the Express app, ensuring only one initialization happens
 * even with concurrent requests during cold start.
 */
function getApp(): Promise<Express> {
	if (app) {
		return Promise.resolve(app);
	}
	if (!appPromise) {
		appPromise = createExpressApp().then(createdApp => {
			app = createdApp;
			return createdApp;
		});
	}
	return appPromise;
}

/**
 * Vercel serverless function handler for all API routes.
 * Uses lazy initialization to create the Express app on first request.
 * All concurrent requests during cold start will wait for the same initialization.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
	// Extract and store the OIDC token from request headers
	// This must happen BEFORE getApp() on cold start, as app initialization
	// may need the token to authenticate with AWS Parameter Store
	const provider = getOIDCTokenProvider();
	provider.extractFromRequest(req.headers as Record<string, string | Array<string> | undefined>);

	const expressApp = await getApp();
	return (expressApp as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
}

export const config = {
	runtime: "nodejs",
	maxDuration: 30,
};

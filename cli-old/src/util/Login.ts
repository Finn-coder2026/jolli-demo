import { saveAuthToken } from "./Config";
import { createServer, type Server, type ServerResponse } from "node:http";
import { URL } from "node:url";
import openBrowser from "open";

export function browserLogin(url: string): Promise<void> {
	const port = 7777;

	async function onListen(): Promise<void> {
		const callbackUrl = `http://localhost:${port}/callback`;
		const loginUrl = `${url}?cli_callback=${encodeURIComponent(callbackUrl)}`;

		console.log("Opening browser to login...");
		console.log(`If the browser doesn't open automatically, visit: ${loginUrl}`);

		await openBrowser(loginUrl);
	}

	return new Promise((resolve, reject) => {
		createLoginServer({
			port,
			onListen,
			onSuccess: resolve,
			onError: reject,
		});
	});
}

interface LoginServerOptions {
	readonly port: number;
	onListen(): void;
	onSuccess(): void;
	onError(error: Error): void;
}

export function createLoginServer(options: LoginServerOptions): Server {
	const { port, onListen, onSuccess, onError } = options;

	const server = createServer(async (req, res) => {
		const url = new URL((req as { url: string }).url, `http://localhost:${port}`);
		if (url.pathname !== "/callback") {
			res.writeHead(404);
			res.end("Not found");
			return;
		}

		const token = url.searchParams.get("token");
		const error = url.searchParams.get("error");

		if (error) {
			const errorMessage = getErrorMessage(error);
			sendHtml(res, 400, "Login Failed", errorMessage);
			server?.close();
			onError(new Error(errorMessage));
			return;
		}

		if (!token) {
			sendHtml(res, 400, "Login Failed", "No token received");
			server?.close();
			onError(new Error("No token received"));
			return;
		}

		try {
			await saveAuthToken(token);
			sendHtml(res, 200, "Login Successful!", "You can close this tab.");
			server?.close();
			onSuccess();
		} catch (error) {
			sendHtml(res, 500, "Error", `Failed to save token: ${error}`);
			server?.close();
			onError(error instanceof Error ? error : new Error(String(error)));
		}
	});

	server.listen(port, onListen);

	return server;
}

function sendHtml(res: ServerResponse, statusCode: number, title: string, message: string): void {
	res.writeHead(statusCode, { "Content-Type": "text/html" });
	res.end(`<html lang="en"><body><h1>${title}</h1><p>${message}</p></body></html>`);
}

function getErrorMessage(errorCode: string): string {
	const errorMessages: Record<string, string> = {
		oauth_failed: "OAuth authentication failed. Please try again.",
		session_missing: "Session expired or missing. Please try again.",
		invalid_provider: "Invalid authentication provider.",
		auth_fetch_failed: "Failed to fetch user information from the authentication provider.",
		no_verified_emails: "No verified email addresses found on your account.",
		server_error: "An unexpected server error occurred. Please try again later.",
	};

	return errorMessages[errorCode] || `Authentication error: ${errorCode}`;
}

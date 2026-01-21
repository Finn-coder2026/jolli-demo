import { exec } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import open from "open";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

const adminDomain = process.env.ADMIN_DOMAIN || "localhost";
const gatewayDomain = process.env.GATEWAY_DOMAIN;
// Always check local server for readiness
const localUrl = "http://localhost:3034";
// When GATEWAY_DOMAIN is set, open HTTPS without port (nginx gateway mode)
const openUrl = gatewayDomain ? `https://${adminDomain}` : `http://${adminDomain}:3034`;
const maxAttempts = 30;
const delay = 500;

const supportedChromiumBrowsers = [
	"Google Chrome Canary",
	"Google Chrome Dev",
	"Google Chrome Beta",
	"Google Chrome",
	"Microsoft Edge",
	"Brave Browser",
	"Vivaldi",
	"Chromium",
];

async function waitForServer() {
	for (let i = 0; i < maxAttempts; i++) {
		try {
			await fetch(localUrl);
			return true;
		} catch {
			await new Promise(r => setTimeout(r, delay));
		}
	}
	return false;
}

async function openBrowser() {
	// On macOS, try to reuse existing tab in Chromium browsers
	if (process.platform === "darwin") {
		try {
			const { stdout: ps } = await execAsync("ps cax");
			const openedBrowser = supportedChromiumBrowsers.find(b => ps.includes(b));
			if (openedBrowser) {
				const scriptPath = join(__dirname, "openChrome.js");
				await execAsync(`osascript -l JavaScript "${scriptPath}" "${openUrl}" "${openedBrowser}"`);
				return;
			}
		} catch {
			// Fall through to regular open
		}
	}

	// Fallback: use regular open package
	await open(openUrl);
}

const ready = await waitForServer();
if (ready) {
	await openBrowser();
}

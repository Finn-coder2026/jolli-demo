import { getLog } from "../util/Logger";
import { Octokit } from "@octokit/rest";

const log = getLog(import.meta);
const GITHUB_NOREPLY_DOMAIN = "users.noreply.github.com";
const GITHUB_EMAIL_FETCH_MAX_ATTEMPTS = 3;
const GITHUB_EMAIL_FETCH_BASE_DELAY_MS = 200;
const RETRYABLE_GITHUB_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function getErrorStatus(error: unknown): number | undefined {
	if (typeof error !== "object" || error === null) {
		return;
	}
	const maybeStatus = (error as { status?: unknown }).status;
	return typeof maybeStatus === "number" ? maybeStatus : undefined;
}

function isRetryableGitHubError(error: unknown): boolean {
	const status = getErrorStatus(error);
	if (typeof status === "number") {
		return RETRYABLE_GITHUB_STATUS_CODES.has(status);
	}

	// No HTTP status usually indicates transport-level failure (DNS, timeout, reset, etc.).
	if (error instanceof Error) {
		return true;
	}

	return false;
}

/**
 * GitHub email object returned from GitHub API.
 */
export interface GitHubEmail {
	email: string;
	primary: boolean;
	verified: boolean;
	visibility: "public" | "private" | null;
}

/**
 * Fetch user's emails from GitHub API using access token.
 *
 * Calls GET https://api.github.com/user/emails
 *
 * @param accessToken - GitHub OAuth access token
 * @returns Array of email objects from GitHub
 */
export async function fetchGitHubEmails(accessToken: string): Promise<Array<GitHubEmail>> {
	const octokit = new Octokit({ auth: accessToken });

	for (let attempt = 1; attempt <= GITHUB_EMAIL_FETCH_MAX_ATTEMPTS; attempt += 1) {
		try {
			const { data } = await octokit.rest.users.listEmailsForAuthenticatedUser();

			log.debug({ emailCount: data.length, attempt }, "Fetched GitHub emails");

			return data.map(email => ({
				email: email.email,
				primary: email.primary,
				verified: email.verified,
				visibility: email.visibility as "public" | "private" | null,
			}));
		} catch (error) {
			const retryable = isRetryableGitHubError(error);
			const isLastAttempt = attempt === GITHUB_EMAIL_FETCH_MAX_ATTEMPTS;
			const status = getErrorStatus(error);

			if (retryable && !isLastAttempt) {
				const delayMs = GITHUB_EMAIL_FETCH_BASE_DELAY_MS * 2 ** (attempt - 1);
				log.warn({ attempt, delayMs, status }, "Retrying GitHub email fetch after transient failure");
				await sleep(delayMs);
				continue;
			}

			log.error(
				{ attempt, status, retryable, maxAttempts: GITHUB_EMAIL_FETCH_MAX_ATTEMPTS, error },
				"Failed to fetch GitHub emails",
			);
			// Return empty array on error to fallback to better-auth default
			return [];
		}
	}

	// Defensive fallback - loop always returns above.
	return [];
}

/**
 * GitHub no-reply addresses are privacy aliases and should not be shown
 * as selectable account emails in onboarding.
 */
function isGitHubNoReplyEmail(email: string): boolean {
	return email.trim().toLowerCase().endsWith(`@${GITHUB_NOREPLY_DOMAIN}`);
}

/**
 * Filter for verified and selectable emails.
 *
 * @param emails - Array of GitHub emails
 * @returns Array of verified emails excluding GitHub no-reply aliases
 */
export function getVerifiedEmails(emails: Array<GitHubEmail>): Array<GitHubEmail> {
	const verified = emails.filter(email => email.verified && !isGitHubNoReplyEmail(email.email));
	const excludedNoReply = emails.filter(email => email.verified && isGitHubNoReplyEmail(email.email)).length;
	log.debug(
		{ total: emails.length, verified: verified.length, excludedNoReply },
		"Filtered verified selectable GitHub emails",
	);
	return verified;
}

/**
 * Select primary email from list, or first email if no primary exists.
 *
 * @param emails - Array of GitHub emails
 * @returns Primary email address, or null if no emails
 */
export function selectPrimaryEmail(emails: Array<GitHubEmail>): string | null {
	if (emails.length === 0) {
		return null;
	}

	const primary = emails.find(email => email.primary);
	const selected = primary ? primary.email : emails[0].email;

	log.debug({ selected, hadPrimary: !!primary }, "Selected primary email");
	return selected;
}

/**
 * The name of an Event emmitted by the /github route in the Webhook Router
 * when the Jolli GitHub App is installed on an org or user.
 * The Event will include the body of the POST made by github to the webhook endpoint.
 */
export const GITHUB_INSTALLATION_CREATED = "github:installation:created";
/**
 * The name of an Event emmitted by the /github route in the Webhook Router
 * when the Jolli GitHub App is installed on an org or user.
 * The Event will include the body of the POST made by github to the webhook endpoint.
 */
export const GITHUB_INSTALLATION_DELETED = "github:installation:deleted";
/**
 * The name of an Event emmitted by the /github route in the Webhook Router
 * when a repo is added to a Jolli GitHub App Install.
 * The Event will include the body of the POST made by github to the webhook endpoint.
 */
export const GITHUB_INSTALLATION_REPOSITORIES_ADDED = "github:installation_repositories:added";
/**
 * The name of an Event emmitted by the /github route in the Webhook Router
 * when a repo is removed from a Jolli GitHub App Install.
 * The Event will include the body of the POST made by github to the webhook endpoint.
 */
export const GITHUB_INSTALLATION_REPOSITORIES_REMOVED = "github:installation_repositories:removed";

/**
 * The nane of an Event emitted by the /github route in the Webhook Router
 * when a push is made to a repo that is connected via a Jolli Github App Install.
 * The Event will include the body of the POST made by github to the webhook endpoint.
 * See https://docs.github.com/en/webhooks/webhook-events-and-payloads#push for the payload info.
 */
export const GITHUB_PUSH = "github:push";

/**
 * Names of Events that should be emmitted by the /github endpoint in the Webhook Router.
 * Each event will include the body of the POST made by github to the webhook endpoint.
 */
export const GITHUB_WEBHOOK_EVENT_NAMES: Set<string> = new Set<string>([
	GITHUB_INSTALLATION_CREATED,
	GITHUB_INSTALLATION_DELETED,
	GITHUB_INSTALLATION_REPOSITORIES_ADDED,
	GITHUB_INSTALLATION_REPOSITORIES_REMOVED,
	GITHUB_PUSH,
]);

/**
 * Event fired when someone enables an installed git repo.
 */
export const INTEGRATIONS_GITHUB_CREATED_EVENT = "integrations:github:created";

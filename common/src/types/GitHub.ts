/**
 * Represents a GitHub organization that Jolli has been granted access.
 */
export interface GitHubOrg {
	/**
	 * The name of the GitHub organization.
	 */
	readonly name: string;
	/**
	 * The repositories in the organization that the app has access to.
	 */
	readonly repos: Array<string>;
	/**
	 * The ISO timestamp of when the org entry was created.
	 */
	readonly createdAt: string;
	/**
	 * The ISO timestamp of when the org entry was last updated.
	 */
	readonly updatedAt: string;
}

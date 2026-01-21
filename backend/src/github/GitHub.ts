import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";

export interface GitHub {
	readonly owner: string;
	readonly repo: string;
	getContent(path: string): Promise<GitHubContent | undefined>;
	getPull(number: number): Promise<GitHubPull | undefined>;
	streamIssues(fromIssue?: number): AsyncIterable<GitHubIssue>;
	streamComments(issue: number): AsyncIterable<GitHubComment>;
	streamReviews(issue: number): AsyncIterable<GitHubReview>;
	streamResults(query: string): AsyncIterable<GitHubResult>;
}

export type GitHubComment = RestEndpointMethodTypes["issues"]["listComments"]["response"]["data"][0];
export type GitHubContent = RestEndpointMethodTypes["repos"]["getContent"]["response"]["data"];
export type GitHubIssue = RestEndpointMethodTypes["issues"]["listForRepo"]["response"]["data"][0];
export type GitHubPull = RestEndpointMethodTypes["pulls"]["get"]["response"]["data"];
export type GitHubResult = RestEndpointMethodTypes["search"]["code"]["response"]["data"]["items"][0];
export type GitHubReview = RestEndpointMethodTypes["pulls"]["listReviews"]["response"]["data"][0];

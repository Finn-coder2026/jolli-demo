import type {
	GitHub,
	GitHubComment,
	GitHubContent,
	GitHubIssue,
	GitHubPull,
	GitHubResult,
	GitHubReview,
} from "./GitHub";
import type { Octokit } from "@octokit/rest";

export function createOctokitGitHub(octokit: Octokit, owner: string, repo: string): GitHub {
	return { owner, repo, getContent, getPull, streamResults, streamIssues, streamComments, streamReviews };

	async function getContent(path: string): Promise<GitHubContent | undefined> {
		try {
			const content = await octokit.rest.repos.getContent({ owner, repo, path });
			return content.data;
		} catch (error) {
			if (isNotFound(error)) {
				return;
			}
			throw error;
		}
	}

	async function getPull(number: number): Promise<GitHubPull | undefined> {
		try {
			const pull = await octokit.rest.pulls.get({ owner, repo, pull_number: number });
			return pull.data;
		} catch (error) {
			if (isNotFound(error)) {
				return;
			}
			throw error;
		}
	}

	async function* streamResults(query: string): AsyncIterable<GitHubResult> {
		const iterator = octokit.paginate.iterator(octokit.search.code, {
			per_page: 100,
			q: `${query} repo:${owner}/${repo}`,
		});

		for await (const { data } of iterator) {
			yield* data;
		}
	}

	async function* streamIssues(fromIssue = 0): AsyncIterable<GitHubIssue> {
		let since: string | undefined;

		if (fromIssue > 0) {
			const lastIssue = await octokit.issues.get({
				owner,
				repo,
				issue_number: fromIssue,
			});
			since = lastIssue.data.created_at;
		}

		const iterator = octokit.paginate.iterator(octokit.issues.listForRepo, {
			owner,
			repo,
			per_page: 100,
			state: "all",
			sort: "created",
			direction: "asc",
			...(since && { since }),
		});

		for await (const { data } of iterator) {
			for (const issue of data) {
				if (issue.number > fromIssue) {
					yield issue;
				}
			}
		}
	}

	async function* streamComments(issue: number): AsyncIterable<GitHubComment> {
		const iterator = octokit.paginate.iterator(octokit.issues.listComments, {
			owner,
			repo,
			per_page: 100,
			issue_number: issue,
		});

		for await (const { data } of iterator) {
			yield* data;
		}
	}

	async function* streamReviews(issue: number): AsyncIterable<GitHubReview> {
		const iterator = octokit.paginate.iterator(octokit.pulls.listReviews, {
			owner,
			repo,
			per_page: 100,
			pull_number: issue,
		});

		for await (const { data } of iterator) {
			yield* data;
		}
	}
}

function isNotFound(error: unknown): boolean {
	return !!error && typeof error === "object" && "status" in error && error.status === 404;
}

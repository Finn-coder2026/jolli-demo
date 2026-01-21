import type { S3 } from "../util/S3";
import type { GitHub, GitHubComment, GitHubContent, GitHubIssue, GitHubPull, GitHubReview } from "./GitHub";
import asyncPool from "tiny-async-pool";

export function createS3CachedGitHub(delegate: GitHub, s3: S3, concurrency = 1): GitHub {
	const prefix = `github.com/${delegate.owner}/${delegate.repo}`;

	return { ...delegate, getContent, getPull, streamIssues, streamComments, streamReviews };

	async function getContent(path: string): Promise<GitHubContent | undefined> {
		const key = `${prefix}/contents/${path}.json.gz`;
		return await cacheKey(key, () => delegate.getContent(path));
	}

	async function getPull(issue: number): Promise<GitHubPull | undefined> {
		const key = `${prefix}/pulls/${issue}.json.gz`;
		return await cacheKey(key, () => delegate.getPull(issue));
	}

	async function* streamIssues(fromIssue = 0): AsyncIterable<GitHubIssue> {
		let lastIssue = 0;

		const keys = await sortedKeys("issues", fromIssue);

		for await (const issue of asyncPool(concurrency, keys, key => s3.readJson<GitHubIssue>(key))) {
			if (issue) {
				lastIssue = Math.max(lastIssue, issue.number);
				yield issue;
			}
		}

		for await (const issue of delegate.streamIssues(lastIssue)) {
			await s3.writeJson(`${prefix}/issues/${issue.number}.json.gz`, issue);
			yield issue;
		}
	}

	async function* streamComments(issue: number): AsyncIterable<GitHubComment> {
		const key = `${prefix}/comments/${issue}.json.gz`;
		for await (const item of streamArray(key, () => delegate.streamComments(issue))) {
			yield item;
		}
	}

	async function* streamReviews(issue: number): AsyncIterable<GitHubReview> {
		const key = `${prefix}/reviews/${issue}.json.gz`;
		for await (const item of streamArray(key, () => delegate.streamReviews(issue))) {
			yield item;
		}
	}

	async function cacheKey<T>(key: string, func: () => Promise<T | undefined>): Promise<T | undefined> {
		let json = await s3.readJson<T>(key);
		if (!json) {
			json = await func();
			if (json) {
				await s3.writeJson(key, json);
			}
		}

		return json;
	}

	async function* streamArray<T>(key: string, func: () => AsyncIterable<T>): AsyncIterable<T> {
		let array = await s3.readJson<Array<T>>(key);
		if (!array) {
			array = [];
			for await (const item of func()) {
				array.push(item);
			}
			await s3.writeJson(key, array);
		}

		yield* array;
	}

	async function sortedKeys(type: string, fromIssue = 0): Promise<Array<string>> {
		const keys: Array<[string, number]> = [];
		for (const key of await s3.listKeys(`${prefix}/${type}/`)) {
			const match = key.match(/\/(\d+)\.json\.gz$/);
			if (match) {
				const issue = Number.parseInt(match[1], 10);
				if (issue > fromIssue) {
					keys.push([key, issue]);
				}
			}
		}

		keys.sort(([, a], [, b]) => a - b);
		return keys.map(([key]) => key);
	}
}

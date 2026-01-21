import { z } from "zod";

/**
 * Reusable schema for github 'repository' objects.
 */
export const RepositorySchema = z.object({
	id: z.number(),
	node_id: z.string(),
	name: z.string(),
	full_name: z.string(),
	private: z.boolean(),
	owner: z.object({
		login: z.string(),
		id: z.number(),
		node_id: z.string(),
		type: z.string(),
	}),
	html_url: z.string(),
	// ... add other repository fields as needed
});

/**
 * Reusable schema for github 'sender' (user) objects.
 */
export const SenderSchema = z.object({
	login: z.string(),
	id: z.number(),
	node_id: z.string(),
	type: z.string(),
	// ... add other sender fields as needed
});

const GitCommitSchema = z.object({
	id: z.string(),
	tree_id: z.string(),
	distinct: z.boolean(),
	message: z.string(),
	timestamp: z.string(),
	url: z.string(),
	author: z.object({
		name: z.string(),
		email: z.string(),
		username: z.string(),
	}),
	committer: z.object({
		name: z.string(),
		email: z.string(),
		username: z.string(),
	}),
	added: z.array(z.string()),
	removed: z.array(z.string()),
	modified: z.array(z.string()),
});

/**
 * Reusable schema for the github 'push' event.
 */
export const GithubPushSchema = z.object({
	ref: z.string(),
	before: z.string(),
	after: z.string(),
	base_ref: z.string().or(z.null()),
	repository: RepositorySchema,
	pusher: z.object({
		name: z.string(),
		email: z.string(),
	}),
	sender: SenderSchema,
	created: z.boolean(),
	deleted: z.boolean(),
	forced: z.boolean(),
	compare: z.string(),
	commits: z.array(GitCommitSchema),
	head_commit: z.nullable(GitCommitSchema),
	// ... other push event fields as needed
});

export type GithubPushSchemaParams = z.infer<typeof GithubPushSchema>;

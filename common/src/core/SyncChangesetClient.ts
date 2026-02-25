import type { ClientAuth } from "./Client";

const BASE_PATH = "/api/v1/sync";

export type SyncChangesetStatus =
	| "proposed"
	| "reviewing"
	| "ready"
	| "publishing"
	| "published"
	| "rejected"
	| "superseded";

export type SyncChangesetReviewDecision = "accept" | "reject" | "amend";

export type SyncChangesetCurrentStatus = "ok" | "missing" | "moved";

export interface SyncChangesetSummary {
	totalFiles: number;
	accepted: number;
	rejected: number;
	amended: number;
	pending: number;
	additions: number;
	deletions: number;
}

export interface SyncChangeset {
	id: number;
	seq: number;
	message?: string | null;
	mergePrompt?: string | null;
	pushedBy?: string | null;
	clientChangesetId: string;
	status: SyncChangesetStatus;
	commitScopeKey: string;
	targetBranch: string;
	payloadHash: string;
	publishedAt?: string | null;
	publishedBy?: string | null;
	createdAt: string;
}

export type SyncChangesetWithSummary = SyncChangeset & {
	summary: SyncChangesetSummary;
};

export interface SyncChangesetFileReview {
	id: number;
	commitFileId: number;
	decision: SyncChangesetReviewDecision;
	amendedContent?: string | null;
	reviewedBy?: string | null;
	reviewedAt: string;
	comment?: string | null;
}

export interface SyncChangesetFile {
	id: number;
	commitId: number;
	fileId: string;
	docJrn: string;
	serverPath: string;
	baseContent: string;
	baseVersion: number;
	incomingContent: string | null;
	incomingContentHash: string | null;
	opType: "upsert" | "delete";
	createdAt: string;
	currentContent: string | null;
	currentVersion: number | null;
	currentServerPath: string | null;
	currentStatus: SyncChangesetCurrentStatus;
	latestReview: SyncChangesetFileReview | null;
}

export interface ReviewChangesetFileRequest {
	decision: SyncChangesetReviewDecision;
	amendedContent?: string;
	comment?: string;
}

export interface ReviewChangesetFileResponse {
	changeset: SyncChangeset;
	/** Backward-compatibility alias — same object as `changeset`. */
	commit: SyncChangeset;
	review: SyncChangesetFileReview;
}

export interface PublishChangesetFileReport {
	id: number;
	fileId: string;
	docJrn: string;
	status: "published" | "conflict" | "rejected" | "missing_review";
	reason?: string;
	currentVersion?: number;
}

export interface PublishChangesetResponse {
	changeset: SyncChangeset;
	/** Backward-compatibility alias — same object as `changeset`. */
	commit: SyncChangeset;
	files: Array<PublishChangesetFileReport>;
	hasConflicts: boolean;
}

export interface ListChangesetsRequest {
	spaceSlug?: string;
	limit?: number;
	beforeId?: number;
}

export interface ListChangesetsResponse {
	changesets: Array<SyncChangesetWithSummary>;
	hasMore: boolean;
	nextBeforeId?: number;
}

export interface SyncChangesetClient {
	listChangesets(options?: { spaceSlug?: string }): Promise<Array<SyncChangesetWithSummary>>;
	listChangesetsPage(options?: ListChangesetsRequest): Promise<ListChangesetsResponse>;
	getChangeset(changesetId: number, options?: { spaceSlug?: string }): Promise<SyncChangesetWithSummary | undefined>;
	getChangesetFiles(changesetId: number, options?: { spaceSlug?: string }): Promise<Array<SyncChangesetFile>>;
	reviewChangesetFile(
		changesetId: number,
		fileId: number,
		request: ReviewChangesetFileRequest,
		options?: { spaceSlug?: string },
	): Promise<ReviewChangesetFileResponse>;
	publishChangeset(changesetId: number, options?: { spaceSlug?: string }): Promise<PublishChangesetResponse>;
}

export function createSyncChangesetClient(baseUrl: string, auth: ClientAuth): SyncChangesetClient {
	const basePath = `${baseUrl}${BASE_PATH}`;
	const { createRequest } = auth;

	return {
		listChangesets,
		listChangesetsPage,
		getChangeset,
		getChangesetFiles,
		reviewChangesetFile,
		publishChangeset,
	};

	function createScopedRequest(
		method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
		body?: unknown,
		spaceSlug?: string,
	): RequestInit {
		const request = createRequest(method, body);
		if (!spaceSlug) {
			return request;
		}
		/* v8 ignore next -- defensive fallback for missing headers */
		const headers = new Headers(request.headers ?? {});
		headers.set("X-Jolli-Space", spaceSlug);
		return { ...request, headers };
	}

	async function listChangesets(options?: { spaceSlug?: string }): Promise<Array<SyncChangesetWithSummary>> {
		const page = await listChangesetsPage(options);
		return page.changesets;
	}

	async function listChangesetsPage(options?: ListChangesetsRequest): Promise<ListChangesetsResponse> {
		const query = new URLSearchParams();
		if (options?.limit !== undefined) {
			query.set("limit", String(options.limit));
		}
		if (options?.beforeId !== undefined) {
			query.set("beforeId", String(options.beforeId));
		}
		const url = `${basePath}/changesets${query.size > 0 ? `?${query.toString()}` : ""}`;
		const response = await fetch(url, createScopedRequest("GET", undefined, options?.spaceSlug));
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			throw new Error(`Failed to list changesets: ${response.statusText}`);
		}
		const payload = (await response.json()) as {
			changesets?: Array<SyncChangesetWithSummary>;
			hasMore?: boolean;
			nextBeforeId?: number;
		};
		return {
			changesets: payload.changesets ?? [],
			hasMore: payload.hasMore ?? false,
			...(payload.nextBeforeId !== undefined ? { nextBeforeId: payload.nextBeforeId } : {}),
		};
	}

	async function getChangeset(
		changesetId: number,
		options?: { spaceSlug?: string },
	): Promise<SyncChangesetWithSummary | undefined> {
		const response = await fetch(
			`${basePath}/changesets/${changesetId}`,
			/* v8 ignore next -- optional chain null-safety */
			createScopedRequest("GET", undefined, options?.spaceSlug),
		);
		auth.checkUnauthorized?.(response);
		if (response.status === 404) {
			return;
		}
		if (!response.ok) {
			throw new Error(`Failed to get changeset: ${response.statusText}`);
		}
		const payload = (await response.json()) as { changeset?: SyncChangesetWithSummary };
		return payload.changeset;
	}

	async function getChangesetFiles(
		changesetId: number,
		options?: { spaceSlug?: string },
	): Promise<Array<SyncChangesetFile>> {
		const response = await fetch(
			`${basePath}/changesets/${changesetId}/files`,
			/* v8 ignore next -- optional chain null-safety */
			createScopedRequest("GET", undefined, options?.spaceSlug),
		);
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			throw new Error(`Failed to get changeset files: ${response.statusText}`);
		}
		const payload = (await response.json()) as { files: Array<SyncChangesetFile> };
		return payload.files;
	}

	async function reviewChangesetFile(
		changesetId: number,
		fileId: number,
		request: ReviewChangesetFileRequest,
		options?: { spaceSlug?: string },
	): Promise<ReviewChangesetFileResponse> {
		const response = await fetch(
			`${basePath}/changesets/${changesetId}/files/${fileId}/review`,
			/* v8 ignore next -- optional chain null-safety */
			createScopedRequest("PATCH", request, options?.spaceSlug),
		);
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			throw new Error(`Failed to review changeset file: ${response.statusText}`);
		}
		return (await response.json()) as ReviewChangesetFileResponse;
	}

	async function publishChangeset(
		changesetId: number,
		options?: { spaceSlug?: string },
	): Promise<PublishChangesetResponse> {
		const response = await fetch(
			`${basePath}/changesets/${changesetId}/publish`,
			/* v8 ignore next -- optional chain null-safety */
			createScopedRequest("POST", {}, options?.spaceSlug),
		);
		auth.checkUnauthorized?.(response);
		if (!response.ok) {
			throw new Error(`Failed to publish changeset: ${response.statusText}`);
		}
		return (await response.json()) as PublishChangesetResponse;
	}
}

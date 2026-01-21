import type { DocDao } from "../dao/DocDao";
import type { Doc, NewDoc } from "../model/Doc";
import { getLog } from "./Logger";
import { excludeFields, type JsonValue, jsonDeepEquals } from "jolli-common";

const log = getLog(import.meta);

const testDocs: Array<NewDoc> = [
	{
		jrn: "doc:api-auth-guide",
		slug: "api-auth-guide",
		path: "",
		updatedBy: "system",
		source: { type: "github", repo: "example/docs", path: "api/authentication.md" },
		sourceMetadata: { branch: "main", lastCommit: "abc123" },
		content: "# API Authentication Guide\n\nThis guide covers authentication methods for our API...",
		contentType: "text/markdown",
		contentMetadata: {
			title: "API Authentication Guide",
			sourceName: "GitHub Docs",
			sourceUrl: "https://github.com/example/docs/blob/main/api/authentication.md",
			status: "needsUpdate",
			commitsAhead: 8,
			qualityScore: 32,
			lastUpdated: "2024-08-06T00:00:00Z",
		},
		spaceId: undefined,
		parentId: undefined,
		docType: "document",
		sortOrder: 0,
		createdBy: "system",
	},
	{
		jrn: "doc:getting-started",
		slug: "getting-started",
		path: "",
		updatedBy: "system",
		source: { type: "zendesk", articleId: "12345" },
		sourceMetadata: { category: "tutorials", locale: "en-us" },
		content: "# Getting Started Tutorial\n\nWelcome to our platform! This tutorial will guide you...",
		contentType: "text/markdown",
		contentMetadata: {
			title: "Getting Started Tutorial",
			sourceName: "Zendesk KB",
			sourceUrl: "https://example.zendesk.com/hc/en-us/articles/12345",
			status: "upToDate",
			qualityScore: 87,
			lastUpdated: "2025-09-30T00:00:00Z",
		},
		spaceId: undefined,
		parentId: undefined,
		docType: "document",
		sortOrder: 0,
		createdBy: "system",
	},
	{
		jrn: "doc:database-schema",
		slug: "database-schema",
		path: "",
		updatedBy: "system",
		source: { type: "github", repo: "example/docs", path: "database/schema.md" },
		sourceMetadata: { branch: "main", lastCommit: "def456" },
		content: "# Database Schema Reference\n\nComplete reference for our database schema...",
		contentType: "text/markdown",
		contentMetadata: {
			title: "Database Schema Reference",
			sourceName: "GitHub Docs",
			sourceUrl: "https://github.com/example/docs/blob/main/database/schema.md",
			status: "needsUpdate",
			commitsAhead: 12,
			qualityScore: 38,
			lastUpdated: "2025-09-01T00:00:00Z",
		},
		spaceId: undefined,
		parentId: undefined,
		docType: "document",
		sortOrder: 0,
		createdBy: "system",
	},
	{
		jrn: "doc:troubleshooting",
		slug: "troubleshooting",
		path: "",
		updatedBy: "system",
		source: { type: "zendesk", articleId: "67890" },
		sourceMetadata: { category: "support", locale: "en-us" },
		content: "# Troubleshooting Common Issues\n\nSolutions to common problems users encounter...",
		contentType: "text/markdown",
		contentMetadata: {
			title: "Troubleshooting Common Issues",
			sourceName: "Zendesk KB",
			sourceUrl: "https://example.zendesk.com/hc/en-us/articles/67890",
			status: "upToDate",
			qualityScore: 92,
			lastUpdated: "2025-10-03T00:00:00Z",
		},
		spaceId: undefined,
		parentId: undefined,
		docType: "document",
		sortOrder: 0,
		createdBy: "system",
	},
	{
		jrn: "doc:advanced-config",
		slug: "advanced-config",
		path: "",
		updatedBy: "system",
		source: { type: "confluence", pageId: "123456", space: "DOCS" },
		sourceMetadata: { lastModified: "2025-09-20T00:00:00Z" },
		content: "# Advanced Configuration\n\nDetailed configuration options for advanced users...",
		contentType: "text/markdown",
		contentMetadata: {
			title: "Advanced Configuration",
			sourceName: "Internal Wiki",
			sourceUrl: "https://example.atlassian.net/wiki/spaces/DOCS/pages/123456",
			status: "underReview",
			qualityScore: 62,
			lastUpdated: "2025-09-20T00:00:00Z",
		},
		spaceId: undefined,
		parentId: undefined,
		docType: "document",
		sortOrder: 0,
		createdBy: "system",
	},
];

export async function seedDocs(dao: DocDao): Promise<void> {
	let forUpdate = false;
	for (const doc of testDocs) {
		forUpdate = false;
		// testDocs always have slug defined, so we can safely use non-null assertion
		const slug = doc.slug as string;
		try {
			const existing = await dao.readDoc(slug);
			if (!existing) {
				await dao.createDoc(doc);
				log.info("Created test document: %s", slug);
			} else {
				const current = excludeFields(existing, ["id", "createdAt", "updatedAt", "version"]);
				if (!jsonDeepEquals(current as unknown as JsonValue, doc as unknown as JsonValue)) {
					forUpdate = true;
					const update: Doc = {
						...existing,
						...doc,
					};
					await dao.updateDoc(update);
					log.info("Updated test document: %s", slug);
				}
			}
		} catch (error) {
			log.error(error, "Failed to %s test document %s", forUpdate ? "update" : "create", slug);
		}
	}
}

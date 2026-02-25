import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDao } from "../dao/DocDao";
import type { GitHubResult } from "../github/GitHub";
import { createOctokitGitHub } from "../github/OctokitGitHub";
import { getTenantContext } from "../tenant/TenantContext";
import { createOctokit } from "../util/OctokitUtil";
import { createQueue } from "../util/Queue";
import express, { type Router } from "express";
import { jrnParser } from "jolli-common";
import { generateSlug } from "jolli-common/server";

export function createIngestRouter(docDaoProvider: DaoProvider<DocDao>): Router {
	const router = express.Router();
	const octokit = createOctokit();
	const concurrency = 16;

	router.post("/sync", async (req, res) => {
		const docDao = docDaoProvider.getDao(getTenantContext());
		const { url } = req.body;

		if (!url || typeof url !== "string") {
			return res.status(400).json({ error: "URL is required" });
		}

		const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)/);
		if (!match) {
			return res.status(400).json({ error: "Invalid GitHub URL" });
		}

		const owner = match[1];
		const repo = match[2];
		const gitHub = createOctokitGitHub(octokit, owner, repo);
		const queue = createQueue(concurrency, processResult);

		try {
			for await (const result of gitHub.streamResults("extension:md")) {
				queue.add(result);
			}

			await queue.close();

			return res.json({ success: true, url });
		} catch (error) {
			return res.status(500).json({
				error: "Failed to ingest URL",
				message: error instanceof Error ? error.message : String(error),
			});
		}

		async function processResult(result: GitHubResult): Promise<void> {
			const contentData = await gitHub.getContent(result.path);
			const content =
				contentData && "content" in contentData
					? Buffer.from(contentData.content, "base64").toString("utf-8")
					: undefined;

			if (content) {
				// Generate JRN using the sources:github format with org/repo/path
				const jrn = jrnParser.githubSource({ org: owner, repo, branch: result.path });

				// Generate slug from the file path (use the last segment)
				const pathSegments = result.path.split("/");
				const fileName = pathSegments[pathSegments.length - 1];
				const fileNameWithoutExt = fileName.replace(/\.(md|mdx)$/i, "");
				const slug = generateSlug(fileNameWithoutExt);

				const newDoc = {
					jrn,
					slug,
					path: "",
					updatedBy: "system",
					content,
					contentType: "text/markdown",
					source: {
						type: "github",
						owner,
						repo,
						path: result.path,
					},
					sourceMetadata: undefined,
					contentMetadata: undefined,
					spaceId: undefined,
					parentId: undefined,
					docType: "document" as const,
					createdBy: "system",
				};

				const oldDoc = await docDao.readDoc(jrn);
				if (oldDoc) {
					await docDao.updateDoc({
						...oldDoc,
						...newDoc,
						version: oldDoc.version + 1,
					});
				} else {
					await docDao.createDoc(newDoc);
				}
			}
		}
	});

	return router;
}

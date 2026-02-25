import { type Doc, defineDocs } from "../model/Doc";
import { defineSites, type NewSite, type Site, type SiteMetadata, type SiteStatus } from "../model/Site";
import type { TenantOrgContext } from "../tenant/TenantContext";
import { stripJolliScriptFrontmatter } from "../util/ContentUtil";
import type { DaoProvider } from "./DaoProvider";
import type { ArticleSiteInfo, ChangedArticle, DocContentMetadata } from "jolli-common";
import { Op, type Sequelize } from "sequelize";

/**
 * Sites DAO
 */
export interface SiteDao {
	/**
	 * Creates a site.
	 * @param docsite the docsite to create.
	 */
	createSite(docsite: NewSite): Promise<Site>;
	/**
	 * Gets a docsite by ID.
	 * @param id the id to look up the docsite by.
	 */
	getSite(id: number): Promise<Site | undefined>;
	/**
	 * Gets a docsite by unique name/slug.
	 * @param name the name to look up the docsite by.
	 */
	getSiteByName(name: string): Promise<Site | undefined>;
	/**
	 * Lists all docsites.
	 */
	listSites(): Promise<Array<Site>>;
	/**
	 * Lists docsites by user ID.
	 * @param userId the user id to filter by.
	 */
	listSitesByUser(userId: number): Promise<Array<Site>>;
	/**
	 * Lists docsites by status.
	 * @param status the status to filter by.
	 */
	listSitesByStatus(status: SiteStatus): Promise<Array<Site>>;
	/**
	 * Updates a docsite.
	 * @param docsite the docsite update.
	 */
	updateSite(docsite: Site): Promise<Site | undefined>;
	/**
	 * Deletes a docsite by ID.
	 * @param id the id of the docsite to delete.
	 */
	deleteSite(id: number): Promise<void>;
	/**
	 * Deletes all docsites.
	 */
	deleteAllSites(): Promise<void>;
	/**
	 * Checks if a docsite needs to be updated based on article changes.
	 * Uses timestamp-based change detection (MAX(updatedAt) comparison).
	 * @param id the id of the docsite to check.
	 * @returns true if articles have been updated since last generation.
	 */
	checkIfNeedsUpdate(id: number): Promise<boolean>;
	/**
	 * Gets the list of articles that have changed since the last site build.
	 * @param id the id of the site to check.
	 * @returns array of changed articles with their metadata.
	 */
	getChangedArticles(id: number): Promise<Array<ChangedArticle>>;
	/**
	 * Gets articles for a specific site based on its article selection.
	 * If the site has selectedArticleJrns, only returns those articles.
	 * Otherwise, returns all articles.
	 * @param siteId the id of the site.
	 * @returns array of Doc objects for the site.
	 */
	getArticlesForSite(siteId: number): Promise<Array<Doc>>;
	/**
	 * Find a site by subdomain.
	 * Used to check subdomain availability.
	 *
	 * @param subdomain - Subdomain to search for (case-insensitive)
	 * @returns Site if found, undefined if available
	 */
	getSiteBySubdomain(subdomain: string): Promise<Site | undefined>;
	/**
	 * Find a site by custom domain.
	 * Used to check custom domain uniqueness within a tenant.
	 *
	 * @param domain - Custom domain to search for (case-insensitive, e.g., "docs.acme.com")
	 * @returns Site if found, undefined if domain is available
	 */
	getSiteByCustomDomain(domain: string): Promise<Site | undefined>;
	/**
	 * Gets all sites that include a given article.
	 * A site includes an article if:
	 * - The site's selectedArticleJrns contains the article JRN, OR
	 * - The site's selectedArticleJrns is null/undefined (include-all mode)
	 *
	 * @param articleJrn - JRN of the article to look up
	 * @returns Lightweight site info array with id, name, displayName, and visibility
	 */
	getSitesForArticle(articleJrn: string): Promise<Array<ArticleSiteInfo>>;
}

export function createSiteDao(sequelize: Sequelize): SiteDao {
	const NewDocsites = defineSites(sequelize);
	const Docs = defineDocs(sequelize);

	return {
		createSite,
		getSite,
		getSiteByName,
		listSites,
		listSitesByUser,
		listSitesByStatus,
		updateSite,
		deleteSite,
		deleteAllSites,
		checkIfNeedsUpdate,
		getChangedArticles,
		getArticlesForSite,
		getSiteBySubdomain,
		getSiteByCustomDomain,
		getSitesForArticle,
	};

	async function createSite(docsite: NewSite): Promise<Site> {
		const created = await NewDocsites.create(docsite as never);
		return created.get({ plain: true });
	}

	async function getSite(id: number): Promise<Site | undefined> {
		const docsite = await NewDocsites.findByPk(id);
		return docsite ? docsite.get({ plain: true }) : undefined;
	}

	async function getSiteByName(name: string): Promise<Site | undefined> {
		const docsite = await NewDocsites.findOne({ where: { name } });
		return docsite ? docsite.get({ plain: true }) : undefined;
	}

	async function listSites(): Promise<Array<Site>> {
		const docsites = await NewDocsites.findAll({ order: [["createdAt", "DESC"]] });
		return docsites.map(d => d.get({ plain: true }));
	}

	async function listSitesByUser(userId: number): Promise<Array<Site>> {
		const docsites = await NewDocsites.findAll({
			where: { userId },
			order: [["createdAt", "DESC"]],
		});
		return docsites.map(d => d.get({ plain: true }));
	}

	async function listSitesByStatus(status: SiteStatus): Promise<Array<Site>> {
		const docsites = await NewDocsites.findAll({
			where: { status },
			order: [["createdAt", "DESC"]],
		});
		return docsites.map(d => d.get({ plain: true }));
	}

	async function updateSite(docsite: Site): Promise<Site | undefined> {
		const existing = await NewDocsites.findByPk(docsite.id);
		if (existing) {
			await NewDocsites.update(docsite, { where: { id: docsite.id } });
			return getSite(docsite.id);
		}
		return;
	}

	async function deleteSite(id: number): Promise<void> {
		await NewDocsites.destroy({ where: { id } });
	}

	async function deleteAllSites(): Promise<void> {
		await NewDocsites.destroy({ where: {} });
	}

	/**
	 * Checks if a site has specific article selection (not "include all").
	 * - undefined = include all mode
	 * - [] = zero articles selected (specific selection of nothing)
	 * - [...jrns] = specific selection of those articles
	 */
	function hasSpecificSelection(metadata: SiteMetadata | undefined): boolean {
		const selectedJrns = metadata?.selectedArticleJrns;
		// Array (even if empty) means specific selection; undefined means include-all
		return selectedJrns !== undefined;
	}

	/**
	 * Gets the selected article JRNs for a site.
	 * Returns the explicit selection if present, otherwise returns all current JRNs (include-all mode).
	 * - undefined = include all (returns all current JRNs)
	 * - [] = zero articles (returns empty set)
	 * - [...jrns] = specific selection (returns those JRNs)
	 */
	function getSelectedJrns(metadata: SiteMetadata | undefined, currentJrns: Set<string>): Set<string> {
		const selectedJrns = metadata?.selectedArticleJrns;
		if (selectedJrns !== undefined) {
			// Explicit selection mode - use the selected JRNs (can be empty for zero selection)
			return new Set(selectedJrns);
		}
		// Include-all mode - all current articles are selected
		return currentJrns;
	}

	/**
	 * Checks if articles have been updated since the docsite was last generated.
	 * Detects three types of changes:
	 * - NEW: Articles that need to be added to the site
	 * - UPDATED: Selected articles modified after lastGeneratedAt
	 * - DELETED/DESELECTED: Generated articles that are now deleted from DB or deselected
	 *
	 * For sites with specific selection:
	 * - NEW only applies to selected articles not yet generated
	 * - UPDATED only applies to selected articles
	 * - DELETED includes both DB deletions and user deselections
	 *
	 * For "include all" sites (no selectedArticleJrns):
	 * - All articles are considered selected
	 * - NEW applies to any article not in last generation
	 * - DELETED applies to any generated article that no longer exists in DB
	 */
	async function checkIfNeedsUpdate(id: number): Promise<boolean> {
		const docsite = await getSite(id);
		if (!docsite) {
			return false;
		}

		// If site is currently building or pending, it doesn't need an update
		if (docsite.status === "building" || docsite.status === "pending") {
			return false;
		}

		// If never generated and not building, needs generation
		if (!docsite.lastGeneratedAt) {
			return true;
		}

		const metadata = docsite.metadata as SiteMetadata | undefined;
		const generatedJrns = new Set(metadata?.generatedArticleJrns || []);
		const lastGeneratedAt = new Date(docsite.lastGeneratedAt);
		const isIncludeAllMode = !hasSpecificSelection(metadata);

		// Get all current articles from DB (excluding soft-deleted and /root internal/system docs)
		const allDocs = await Docs.findAll({
			attributes: ["jrn", "updatedAt"],
			// biome-ignore lint/suspicious/noExplicitAny: Sequelize Op.is null typing mismatch with Doc model
			where: { deletedAt: { [Op.is]: null } } as any,
			raw: true,
		});
		const currentDocs = allDocs.filter(d => !d.jrn.startsWith("/root"));
		const currentJrns = new Set(currentDocs.map(d => d.jrn));

		// Determine selected JRNs based on mode
		const selectedJrns = getSelectedJrns(metadata, currentJrns);

		// Check for NEW articles that should be added to the site
		// In include-all mode: any article not in generated set is new
		// In specific selection mode: only selected articles not in generated set are new
		for (const doc of currentDocs) {
			if (!generatedJrns.has(doc.jrn) && (isIncludeAllMode || selectedJrns.has(doc.jrn))) {
				return true;
			}
		}

		// Check for UPDATED articles (selected and modified after lastGeneratedAt)
		const selectedDocs = currentDocs.filter(d => selectedJrns.has(d.jrn));
		for (const doc of selectedDocs) {
			if (new Date(doc.updatedAt) > lastGeneratedAt) {
				return true;
			}
		}

		// Check for DELETED/DESELECTED articles
		// An article needs to be removed from the site if:
		// 1. It was generated but is now deleted from DB, OR
		// 2. It was generated but is now deselected (specific selection mode only)
		for (const jrn of generatedJrns) {
			const existsInDb = currentJrns.has(jrn);
			const isSelected = selectedJrns.has(jrn);

			// Article deleted from DB
			if (!existsInDb) {
				return true;
			}

			// Article deselected (exists in DB but not in selection, in specific selection mode)
			if (!isIncludeAllMode && !isSelected) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Creates a ChangedArticle entry for a new article.
	 */
	function createNewArticleEntry(doc: Doc, isIncludeAllMode: boolean): ChangedArticle {
		const docMetadata = doc.contentMetadata as DocContentMetadata | undefined;
		// In include-all mode: content (new article created)
		// In specific selection mode: selection (user selected this article)
		const changeReason = isIncludeAllMode ? "content" : "selection";
		return {
			id: doc.id,
			title: docMetadata?.title || doc.jrn,
			jrn: doc.jrn,
			updatedAt: doc.updatedAt.toISOString(),
			contentType: doc.contentType,
			changeType: "new",
			changeReason,
			docType: doc.docType,
		};
	}

	/**
	 * Creates a ChangedArticle entry for an updated article.
	 */
	function createUpdatedArticleEntry(doc: Doc): ChangedArticle {
		const docMetadata = doc.contentMetadata as DocContentMetadata | undefined;
		return {
			id: doc.id,
			title: docMetadata?.title || doc.jrn,
			jrn: doc.jrn,
			updatedAt: doc.updatedAt.toISOString(),
			contentType: doc.contentType,
			changeType: "updated",
			changeReason: "content", // Updated articles are always content changes
			docType: doc.docType,
		};
	}

	/**
	 * Creates a ChangedArticle entry for a deleted article (from DB).
	 * Uses the stored title from the last generation if available, falling back to JRN.
	 * No doc record available, so docType is left undefined.
	 */
	function createDeletedFromDbEntry(jrn: string, generatedTitles: Record<string, string>): ChangedArticle {
		return {
			id: -1, // No ID for deleted articles
			title: generatedTitles[jrn] || jrn, // Use stored title from last generation, fallback to JRN
			jrn,
			updatedAt: new Date().toISOString(),
			contentType: "unknown",
			changeType: "deleted",
			changeReason: "content", // Article was actually deleted from database
		};
	}

	/**
	 * Creates a ChangedArticle entry for a deselected article.
	 */
	function createDeselectedEntry(jrn: string, doc: Doc | undefined): ChangedArticle {
		const docMetadata = doc?.contentMetadata as DocContentMetadata | undefined;
		const entry: ChangedArticle = {
			/* v8 ignore next */ id: doc?.id ?? -1, // Fallback if doc lookup fails
			/* v8 ignore next */ title: docMetadata?.title || jrn, // Fallback to JRN
			jrn,
			updatedAt: new Date().toISOString(), // Use current time for deselection
			/* v8 ignore next */ contentType: doc?.contentType || "unknown", // Fallback
			changeType: "deleted", // Deselection shows as "deleted" since it will be removed from site
			changeReason: "selection", // Article was deselected by user
		};
		/* v8 ignore next 3 */
		if (doc?.docType !== undefined) {
			entry.docType = doc.docType;
		}
		return entry;
	}

	/**
	 * Finds new and updated articles by comparing current docs with generated JRNs.
	 */
	function findNewAndUpdatedArticles(
		currentDocs: Array<Doc>,
		generatedJrns: Set<string>,
		selectedJrns: Set<string>,
		lastGeneratedAt: Date,
		isIncludeAllMode: boolean,
	): Array<ChangedArticle> {
		const changedArticles: Array<ChangedArticle> = [];

		for (const doc of currentDocs) {
			const isNewArticle = !generatedJrns.has(doc.jrn);
			const isSelected = isIncludeAllMode || selectedJrns.has(doc.jrn);

			if (isNewArticle && isSelected) {
				changedArticles.push(createNewArticleEntry(doc, isIncludeAllMode));
			} else if (!isNewArticle && isSelected && doc.updatedAt > lastGeneratedAt) {
				changedArticles.push(createUpdatedArticleEntry(doc));
			}
		}

		return changedArticles;
	}

	/**
	 * Finds deleted and deselected articles by comparing generated JRNs with current state.
	 * Uses generatedTitles to recover the original title for articles deleted from the DB.
	 */
	function findDeletedAndDeselectedArticles(
		generatedJrns: Set<string>,
		currentJrns: Set<string>,
		selectedJrns: Set<string>,
		docsByJrn: Map<string, Doc>,
		isIncludeAllMode: boolean,
		generatedTitles: Record<string, string>,
	): Array<ChangedArticle> {
		const changedArticles: Array<ChangedArticle> = [];

		for (const jrn of generatedJrns) {
			const existsInDb = currentJrns.has(jrn);
			const isSelected = selectedJrns.has(jrn);

			if (!existsInDb) {
				changedArticles.push(createDeletedFromDbEntry(jrn, generatedTitles));
			} else if (!isIncludeAllMode && !isSelected) {
				changedArticles.push(createDeselectedEntry(jrn, docsByJrn.get(jrn)));
			}
		}

		return changedArticles;
	}

	/**
	 * Gets articles that have changed since the site was last generated.
	 * Returns all three change types: new, updated, and deleted.
	 *
	 * Change detection rules:
	 * - NEW: Selected articles not in last generation (need to be added to site)
	 * - UPDATED: Selected articles modified after lastGeneratedAt
	 * - DELETED: Generated articles that are now deleted from DB OR deselected
	 *
	 * For "include all" sites (no selectedArticleJrns):
	 * - All articles are considered selected
	 * - NEW applies to any article not in last generation
	 * - DELETED applies to any generated article that no longer exists in DB
	 *
	 * For sites with specific selection:
	 * - NEW only applies to selected articles not yet generated
	 * - DELETED includes both DB deletions and user deselections
	 *
	 * For sites that have never been built (no lastGeneratedAt):
	 * - All selected articles are shown as "new" (to be added)
	 * - No "updated" or "deleted" changes since nothing has been generated yet
	 *
	 * Returns empty array if site doesn't exist.
	 */
	async function getChangedArticles(id: number): Promise<Array<ChangedArticle>> {
		const docsite = await getSite(id);
		if (!docsite) {
			return [];
		}

		const metadata = docsite.metadata as SiteMetadata | undefined;
		const isIncludeAllMode = !hasSpecificSelection(metadata);

		// Get all current articles (excluding soft-deleted and /root internal/system docs)
		const allDocs = await Docs.findAll({
			// biome-ignore lint/suspicious/noExplicitAny: Sequelize Op.is null typing mismatch with Doc model
			where: { deletedAt: { [Op.is]: null } } as any,
			order: [["updatedAt", "DESC"]],
		});
		const currentDocs = allDocs.map(d => d.get({ plain: true })).filter(d => !d.jrn.startsWith("/root"));

		// Build lookup structures
		const currentJrns = new Set<string>(currentDocs.map(d => d.jrn));
		const docsByJrn = new Map<string, Doc>(currentDocs.map(d => [d.jrn, d]));
		const selectedJrns = getSelectedJrns(metadata, currentJrns);

		// For sites that have never been built, show all selected articles as "new"
		if (!docsite.lastGeneratedAt) {
			return getChangesForUnbuiltSite(currentDocs, selectedJrns, isIncludeAllMode);
		}

		const lastGeneratedAt = new Date(docsite.lastGeneratedAt);
		const generatedJrns = new Set(metadata?.generatedArticleJrns || []);
		const generatedTitles = metadata?.generatedArticleTitles || {};

		// Find all changed articles
		const newAndUpdated = findNewAndUpdatedArticles(
			currentDocs,
			generatedJrns,
			selectedJrns,
			lastGeneratedAt,
			isIncludeAllMode,
		);
		const deletedAndDeselected = findDeletedAndDeselectedArticles(
			generatedJrns,
			currentJrns,
			selectedJrns,
			docsByJrn,
			isIncludeAllMode,
			generatedTitles,
		);

		return [...newAndUpdated, ...deletedAndDeselected];
	}

	/**
	 * Gets changes for sites that have never been successfully built.
	 * All selected articles are shown as "new" since nothing has been generated yet.
	 */
	function getChangesForUnbuiltSite(
		currentDocs: Array<Doc>,
		selectedJrns: Set<string>,
		isIncludeAllMode: boolean,
	): Array<ChangedArticle> {
		const changedArticles: Array<ChangedArticle> = [];

		for (const doc of currentDocs) {
			const isSelected = isIncludeAllMode || selectedJrns.has(doc.jrn);
			if (isSelected) {
				changedArticles.push(createNewArticleEntry(doc, isIncludeAllMode));
			}
		}

		return changedArticles;
	}

	/**
	 * Gets articles for a specific site based on its article selection.
	 * If the site has selectedArticleJrns, only returns those articles.
	 * Otherwise, returns all articles.
	 * Strips jolliscript frontmatter from article content before returning.
	 */
	async function getArticlesForSite(siteId: number): Promise<Array<Doc>> {
		const site = await getSite(siteId);
		if (!site) {
			return [];
		}

		const metadata = site.metadata as SiteMetadata | undefined;
		const selectedJrns = metadata?.selectedArticleJrns;

		// null/undefined = return all articles (include all mode)
		// [] (empty array) = return no articles (zero selection)
		// non-empty array = return only selected articles
		if (selectedJrns === null || selectedJrns === undefined) {
			const allDocs = await Docs.findAll({
				// biome-ignore lint/suspicious/noExplicitAny: Sequelize Op.is null typing mismatch with Doc model
				where: { deletedAt: { [Op.is]: null } } as any,
				// Sort by parentId first to group siblings together (sortOrder is scoped per parent),
				// then by sortOrder within each parent to preserve tree structure
				order: [
					["parentId", "ASC"],
					["sortOrder", "ASC"],
				],
			});
			// Filter out internal /root docs and strip jolliscript frontmatter
			const filteredDocs = allDocs.filter(d => !d.get({ plain: true }).jrn.startsWith("/root"));
			return filteredDocs.map(d => {
				const doc = d.get({ plain: true });
				return { ...doc, content: stripJolliScriptFrontmatter(doc.content) };
			});
		}

		// Empty array means zero articles selected
		if (selectedJrns.length === 0) {
			return [];
		}

		// Return only selected articles with jolliscript frontmatter stripped
		// Sort by parentId to group siblings, then sortOrder within each parent
		const selectedDocs = await Docs.findAll({
			where: {
				jrn: { [Op.in]: selectedJrns },
				deletedAt: { [Op.is]: null },
				// biome-ignore lint/suspicious/noExplicitAny: Sequelize Op.is null typing mismatch with Doc model
			} as any,
			order: [
				["parentId", "ASC"],
				["sortOrder", "ASC"],
			],
		});
		return selectedDocs.map(d => {
			const doc = d.get({ plain: true });
			return { ...doc, content: stripJolliScriptFrontmatter(doc.content) };
		});
	}

	/**
	 * Find a site by subdomain (case-insensitive).
	 * Searches the metadata JSONB field for the subdomain value.
	 */
	async function getSiteBySubdomain(subdomain: string): Promise<Site | undefined> {
		// Query JSONB field for subdomain (case-insensitive)
		const sites = await NewDocsites.findAll({
			where: sequelize.where(
				sequelize.fn("lower", sequelize.literal("metadata->>'subdomain'")),
				subdomain.toLowerCase(),
			),
			limit: 1,
		});

		return sites.length > 0 ? sites[0].get({ plain: true }) : undefined;
	}

	/**
	 * Find a site by custom domain (case-insensitive).
	 * Searches the metadata JSONB customDomains array for the domain value.
	 */
	async function getSiteByCustomDomain(domain: string): Promise<Site | undefined> {
		// Query JSONB array for domain (case-insensitive)
		// Use EXISTS to check if any element in the customDomains array has a matching domain
		// COALESCE handles null/missing customDomains gracefully by treating as empty array
		const sites = await NewDocsites.findAll({
			where: sequelize.literal(`EXISTS (
				SELECT 1 FROM jsonb_array_elements(
					COALESCE(metadata->'customDomains', '[]'::jsonb)
				) AS cd
				WHERE LOWER(cd->>'domain') = LOWER(:domain)
			)`),
			replacements: { domain },
			limit: 1,
		});

		return sites.length > 0 ? sites[0].get({ plain: true }) : undefined;
	}

	/**
	 * Gets all sites that include a given article.
	 * Filters at the database level to avoid a full table scan:
	 *  - Include-all mode: selectedArticleJrns key is absent/null in metadata JSONB
	 *  - Explicit selection: selectedArticleJrns array contains the article JRN
	 *
	 * Note: visibility is derived from metadata.jwtAuth.enabled rather than a stored
	 * column because jwtAuth.enabled is the canonical source of truth for site access control.
	 */
	async function getSitesForArticle(articleJrn: string): Promise<Array<ArticleSiteInfo>> {
		const sites = await NewDocsites.findAll({
			attributes: ["id", "name", "displayName", "metadata"],
			where: sequelize.literal(
				`(metadata->'selectedArticleJrns' IS NULL
				OR metadata->'selectedArticleJrns' @> :jrnJson::jsonb)`,
			),
			replacements: { jrnJson: JSON.stringify([articleJrn]) },
		});

		return sites.map(siteModel => {
			const site = siteModel.get({ plain: true });
			const metadata = site.metadata as SiteMetadata | undefined;
			// "internal" when JWT auth is enforced, "external" for public sites
			const visibility = metadata?.jwtAuth?.enabled === true ? "internal" : "external";
			return { id: site.id, name: site.name, displayName: site.displayName, visibility };
		});
	}
}

export function createSiteDaoProvider(defaultDao: SiteDao): DaoProvider<SiteDao> {
	return {
		getDao(context: TenantOrgContext | undefined): SiteDao {
			return context?.database.siteDao ?? defaultDao;
		},
	};
}

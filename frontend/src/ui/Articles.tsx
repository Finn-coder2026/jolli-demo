import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { SelectBox } from "../components/ui/SelectBox";
import { useClient } from "../contexts/ClientContext";
import { useNavigation } from "../contexts/NavigationContext";
import { PREFERENCES } from "../contexts/PreferencesContext";
import { useLocation } from "../contexts/RouterContext";
import { usePreference } from "../hooks/usePreference";
import { formatTimestamp } from "../util/DateTimeUtil";
import { getLog } from "../util/Logger";
import { Article } from "./Article";
import { DraftSelectionDialog } from "./components/DraftSelectionDialog";
import { DuplicateTitleDialog } from "./components/DuplicateTitleDialog";
import { FilterCard } from "./components/FilterCard";
import { NewArticleTitleDialog } from "./components/NewArticleTitleDialog";
import type {
	Doc,
	DocContentMetadata,
	DocDraft,
	DocDraftContentType,
	DraftCounts,
	DraftListFilter,
} from "jolli-common";
import {
	BookOpen,
	Edit,
	ExternalLink,
	FileCode,
	FileEdit,
	FileText,
	FileUp,
	Inbox,
	Plus,
	Search,
	Share2,
	Sparkles,
	Trash2,
} from "lucide-react";
import { type ReactElement, useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

function getSourceIcon(sourceName: string) {
	if (sourceName.toLowerCase().includes("github")) {
		return FileCode;
	}
	if (sourceName.toLowerCase().includes("wiki") || sourceName.toLowerCase().includes("confluence")) {
		return BookOpen;
	}
	return FileText;
}

function getContentTypeLabel(
	contentType: string | undefined,
	labels: { typeMarkdown: string; typeJson: string; typeYaml: string },
): string {
	switch (contentType) {
		case "application/json":
		case "application/vnd.oai.openapi+json":
			return labels.typeJson;
		case "application/yaml":
		case "application/vnd.oai.openapi":
			return labels.typeYaml;
		/* v8 ignore next 2 -- unreachable: only called when isNonMarkdownContentType is true */
		default:
			return labels.typeMarkdown;
	}
}

function isNonMarkdownContentType(contentType: string | undefined): boolean {
	return (
		contentType === "application/json" ||
		contentType === "application/yaml" ||
		contentType === "application/vnd.oai.openapi+json" ||
		contentType === "application/vnd.oai.openapi"
	);
}

function getStatusBadge(
	status: string,
	commitsAhead: number | undefined,
	// biome-ignore lint/suspicious/noExplicitAny: Intlayer returns Proxy objects with unknown structure
	statusLabels: { upToDate: any; needsUpdate: any; underReview: any; statusNeedsUpdateWithCommits: any },
) {
	switch (status) {
		case "upToDate":
			return (
				<Badge className="bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20">
					{statusLabels.upToDate}
				</Badge>
			);
		case "needsUpdate":
			return (
				<Badge className="bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-500/20">
					{commitsAhead
						? statusLabels.statusNeedsUpdateWithCommits({ count: commitsAhead })
						: statusLabels.needsUpdate}
				</Badge>
			);
		case "underReview":
			return (
				<Badge className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20">
					{statusLabels.underReview}
				</Badge>
			);
		default:
			return null;
	}
}

/** Union type for items in the combined list */
type ListItem = { type: "article"; data: Doc } | { type: "draft"; data: DocDraft };

/** Builds the filtered list of articles and drafts based on current filter settings */
function buildListItems(
	docs: Array<Doc>,
	drafts: Array<DocDraft>,
	draftFilter: DraftListFilter,
	searchQuery: string,
	filterSpace: string,
): Array<ListItem> {
	const listItems: Array<ListItem> = [];

	// Build a set of article IDs that have drafts editing them
	const articlesBeingEdited = new Set(drafts.filter(d => d.docId != null).map(d => d.docId));

	// Add NEW drafts only (drafts without docId) - NOT for "suggested-updates" filter
	// Drafts that edit existing articles are NOT shown as separate items
	if (draftFilter !== "suggested-updates") {
		for (const draft of drafts) {
			// Only show NEW drafts (no docId) - drafts editing articles are shown via the article row
			if (draft.docId != null) {
				continue;
			}
			const matchesSearch = searchQuery === "" || draft.title.toLowerCase().includes(searchQuery.toLowerCase());
			if (matchesSearch) {
				listItems.push({ type: "draft", data: draft });
			}
		}
	}

	// Add articles (only when filter is "all" or "suggested-updates")
	if (draftFilter === "all" || draftFilter === "suggested-updates") {
		for (const doc of docs) {
			const metadata = (doc.contentMetadata as DocContentMetadata | undefined) ?? {};
			const title = metadata.title ?? "";
			const sourceName = metadata.sourceName ?? "";

			const matchesSearch =
				searchQuery === "" ||
				title.toLowerCase().includes(searchQuery.toLowerCase()) ||
				sourceName.toLowerCase().includes(searchQuery.toLowerCase());

			// Default (empty filterSpace) shows all articles EXCEPT those starting with /root
			const matchesSpace = filterSpace === "" ? !doc.jrn.startsWith("/root") : doc.jrn.startsWith(filterSpace);

			// For "suggested-updates" filter, only show articles that have drafts with pending changes
			// For "all" filter, show all articles
			const matchesSuggestionFilter = draftFilter !== "suggested-updates" || articlesBeingEdited.has(doc.id);

			if (matchesSearch && matchesSpace && matchesSuggestionFilter) {
				listItems.push({ type: "article", data: doc });
			}
		}
	}

	return listItems;
}

export function Articles(): ReactElement {
	const content = useIntlayer("articles");
	const dateTimeContent = useIntlayer("date-time");
	const client = useClient();
	const location = useLocation();
	const [docs, setDocs] = useState<Array<Doc>>([]);
	const [drafts, setDrafts] = useState<Array<DocDraft>>([]);
	const [loading, setLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState("");
	const [draftCounts, setDraftCounts] = useState<DraftCounts>({
		all: 0,
		myNewDrafts: 0,
		mySharedNewDrafts: 0,
		sharedWithMe: 0,
		suggestedUpdates: 0,
	});
	const [draftFilter, setDraftFilter] = usePreference(PREFERENCES.articlesDraftFilter);
	const [showDraftDialog, setShowDraftDialog] = useState(false);
	const [showTitleDialog, setShowTitleDialog] = useState(false);
	const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
	const [unsavedDrafts, setUnsavedDrafts] = useState<Array<DocDraft>>([]);
	const [pendingTitle, setPendingTitle] = useState("");
	const [pendingContentType, setPendingContentType] = useState<DocDraftContentType>("text/markdown");
	const [duplicateArticles, setDuplicateArticles] = useState<Array<Doc>>([]);
	const [duplicateDrafts, setDuplicateDrafts] = useState<Array<DocDraft>>([]);
	const [deleting, setDeleting] = useState<string | null>(null);
	// Store article IDs with suggested updates separately (not affected by filter)
	const [articlesWithSuggestionsIds, setArticlesWithSuggestionsIds] = useState<Set<number>>(new Set());

	// Get URL parameters from context
	const { articleView, articleJrn, navigate, open } = useNavigation();

	// Get space filter from URL query params
	const urlParams = new URLSearchParams(location.search);
	const filterSpace = urlParams.get("space") ?? "";

	// Update URL when space filter changes
	function setFilterSpace(space: string): void {
		const params = new URLSearchParams(location.search);
		if (space) {
			params.set("space", space);
		} else {
			params.delete("space");
		}
		const queryString = params.toString();
		navigate(`/articles${queryString ? `?${queryString}` : ""}`);
	}

	useEffect(() => {
		fetchDocs().then();
		fetchDraftCounts().then();
		fetchArticlesWithSuggestions().then();
	}, []);

	// Fetch drafts when filter changes
	useEffect(() => {
		fetchDrafts().then();
	}, [draftFilter]);

	async function fetchDocs() {
		try {
			// Include root docs so the space filter can show /root space articles
			const data = await client.docs().listDocs({ includeRoot: true });
			setDocs(data);
		} catch (error) {
			log.error(error, "Failed to fetch documents.");
		} finally {
			setLoading(false);
		}
	}

	async function fetchDrafts() {
		try {
			const result = await client.docDrafts().listDocDraftsFiltered(draftFilter);
			setDrafts(result.drafts);
		} catch (error) {
			log.error(error, "Failed to fetch drafts.");
		}
	}

	async function fetchDraftCounts() {
		try {
			const counts = await client.docDrafts().getDraftCounts();
			setDraftCounts(counts);
		} catch (error) {
			log.error(error, "Failed to fetch draft counts.");
		}
	}

	async function fetchArticlesWithSuggestions() {
		try {
			// Fetch drafts with suggested updates (those with docId, meaning they're editing articles)
			const result = await client.docDrafts().listDocDraftsFiltered("suggested-updates");
			const ids = new Set(result.drafts.filter(d => d.docId != null).map(d => d.docId as number));
			setArticlesWithSuggestionsIds(ids);
		} catch (error) {
			log.error(error, "Failed to fetch articles with suggestions.");
		}
	}

	async function handleNewDraft() {
		try {
			// Fetch all drafts and filter for unsaved ones (docId is null or undefined)
			const allDrafts = await client.docDrafts().listDocDrafts(100, 0);
			log.info("Found %d total drafts", allDrafts.length);

			// Filter for drafts without a docId (either null or undefined)
			const draftsWithoutDocId = allDrafts.filter(draft => !draft.docId);
			log.info("Found %d unsaved drafts (no docId)", draftsWithoutDocId.length);

			// Debug: Log first few drafts to see their structure
			if (allDrafts.length > 0) {
				log.info("Sample draft: %O", allDrafts[0]);
			}

			if (draftsWithoutDocId.length > 0) {
				// Show dialog to let user choose
				log.info("Showing draft selection dialog");
				setUnsavedDrafts(draftsWithoutDocId);
				setShowDraftDialog(true);
			} else {
				// No unsaved drafts, show title dialog
				log.info("No unsaved drafts found, showing title dialog");
				setShowTitleDialog(true);
			}
		} /* v8 ignore next 3 - error handler tested indirectly */ catch (error) {
			log.error(error, "Failed to check for drafts.");
		}
	}

	/* v8 ignore next 17 - async navigation function tested indirectly */
	async function createNewDraft(title: string, contentType: DocDraftContentType = "text/markdown", space?: string) {
		try {
			const draft = await client.docDrafts().createDocDraft({
				docId: undefined,
				title,
				content: "",
				contentType,
				...(space ? { space } : {}),
			});
			// Small delay to ensure draft is fully persisted before navigating
			await new Promise(resolve => setTimeout(resolve, 100));
			navigate(`/article-draft/${draft.id}`);
		} catch (error) {
			log.error(error, "Failed to create draft.");
		}
	}

	async function handleCreateWithTitle(title: string, contentType: DocDraftContentType) {
		setShowTitleDialog(false);

		// Use the selected space filter for new article creation
		const space = filterSpace || undefined;

		try {
			log.info("Checking for duplicate titles with: %s", title);
			// Search for existing articles and drafts with similar title
			const [articles, drafts] = await Promise.all([
				client.docs().searchByTitle(title),
				client.docDrafts().searchByTitle(title),
			]);

			log.info("Found %d articles and %d drafts matching title", articles.length, drafts.length);

			// If duplicates found, show confirmation dialog
			/* v8 ignore next 8 - duplicate detection path tested but coverage tool doesnt detect */
			if (articles.length > 0 || drafts.length > 0) {
				log.info("Showing duplicate dialog");
				setPendingTitle(title);
				setPendingContentType(contentType);
				setDuplicateArticles(articles);
				setDuplicateDrafts(drafts);
				setShowDuplicateDialog(true);
			} else {
				/* v8 ignore next 4 - no duplicates path tested but coverage tool doesn't detect */
				// No duplicates, create draft immediately
				log.info("No duplicates found, creating draft");
				await createNewDraft(title, contentType, space);
			}
		} /* v8 ignore next 4 - error path tested indirectly */ catch (error) {
			log.error(error, "Failed to check for duplicate titles, creating draft anyway");
			// On error, proceed with creation anyway
			await createNewDraft(title, contentType, space);
		}
	}

	/* v8 ignore next 4 - navigation handler tested indirectly */
	function handleSelectDraft(draftId: number) {
		setShowDraftDialog(false);
		navigate(`/article-draft/${draftId}`);
	}

	function handleCreateNewFromDialog() {
		setShowDraftDialog(false);
		setShowTitleDialog(true);
	}

	function handleCloseDialog() {
		setShowDraftDialog(false);
	}

	/* v8 ignore next 16 - async handler tested indirectly */
	async function handleDeleteDraft(draftId: number) {
		try {
			await client.docDrafts().deleteDocDraft(draftId);
			// Refresh the unsaved drafts list
			const allDrafts = await client.docDrafts().listDocDrafts(100, 0);
			const draftsWithoutDocId = allDrafts.filter(draft => !draft.docId);
			setUnsavedDrafts(draftsWithoutDocId);

			// If no more drafts, close the dialog
			if (draftsWithoutDocId.length === 0) {
				setShowDraftDialog(false);
			}
		} catch (error) {
			log.error(error, "Failed to delete draft.");
		}
	}

	/* v8 ignore next 4 - event handler callback tested indirectly */
	function handleOpenArticle(jrn: string) {
		setShowDuplicateDialog(false);
		navigate(`/articles/${encodeURIComponent(jrn)}`);
	}

	/* v8 ignore next 4 - event handler callback tested indirectly */
	function handleOpenDraft(id: number) {
		setShowDuplicateDialog(false);
		navigate(`/article-draft/${id}`);
	}

	/* v8 ignore next 5 - event handler callback tested indirectly */
	async function handleCreateAnyway() {
		setShowDuplicateDialog(false);
		const space = filterSpace || undefined;
		await createNewDraft(pendingTitle, pendingContentType, space);
	}

	function handleCloseDuplicateDialog() {
		setShowDuplicateDialog(false);
		setPendingTitle("");
		setPendingContentType("text/markdown");
		setDuplicateArticles([]);
		setDuplicateDrafts([]);
	}

	/* v8 ignore next 11 - async navigation handler tested indirectly */
	async function handleEditArticle(jrn: string) {
		try {
			// Create or get existing draft from article
			const draft = await client.docs().createDraftFromArticle(jrn);
			// Small delay to ensure draft is fully persisted before navigating
			await new Promise(resolve => setTimeout(resolve, 100));
			navigate(`/article-draft/${draft.id}`);
		} catch (error) {
			log.error(error, "Failed to create draft from article.");
		}
	}

	async function handleDeleteArticle(jrn: string, title: string) {
		if (!confirm(content.confirmDeleteArticle({ title }).value)) {
			return;
		}

		setDeleting(jrn);
		try {
			await client.docs().deleteDoc(jrn);
			setDocs(prevDocs => prevDocs.filter(d => d.jrn !== jrn));
		} catch (error) {
			log.error(error, "Failed to delete article.");
		} finally {
			setDeleting(null);
		}
	}

	/* v8 ignore next 13 - async handler tested indirectly */
	async function handleDeleteDraftFromList(draftId: number, title: string) {
		if (!confirm(content.confirmDeleteDraft({ title }).value)) {
			return;
		}

		try {
			await client.docDrafts().deleteDocDraft(draftId);
			setDrafts(prevDrafts => prevDrafts.filter(d => d.id !== draftId));
			// Refresh counts
			fetchDraftCounts().then();
		} catch (error) {
			log.error(error, "Failed to delete draft.");
		}
	}

	// Build combined list of articles and drafts based on filter
	const listItems = buildListItems(docs, drafts, draftFilter, searchQuery, filterSpace);

	// Render the article detail view if we're viewing a specific article
	if (articleView === "detail" && articleJrn) {
		return <Article jrn={articleJrn} />;
	}

	return (
		<>
			{showDraftDialog && (
				<DraftSelectionDialog
					drafts={unsavedDrafts}
					onSelectDraft={handleSelectDraft}
					onCreateNew={handleCreateNewFromDialog}
					onClose={handleCloseDialog}
					onDeleteDraft={handleDeleteDraft}
				/>
			)}
			{showTitleDialog && (
				<NewArticleTitleDialog
					onCreateWithTitle={handleCreateWithTitle}
					onClose={
						/* v8 ignore next - close callback tested indirectly */
						() => setShowTitleDialog(false)
					}
				/>
			)}
			{showDuplicateDialog && (
				<DuplicateTitleDialog
					title={pendingTitle}
					existingArticles={duplicateArticles}
					existingDrafts={duplicateDrafts}
					onOpenArticle={handleOpenArticle}
					onOpenDraft={handleOpenDraft}
					onCreateAnyway={handleCreateAnyway}
					onClose={handleCloseDuplicateDialog}
				/>
			)}
			<div className="bg-card rounded-lg p-6 border h-full overflow-auto max-w-full">
				{/* Header with New Article button */}
				<div className="mb-6 flex items-center justify-between">
					<div>
						<h1 className="font-semibold" style={{ fontSize: "2rem", margin: "0 0 8px" }}>
							{content.title}
						</h1>
						<p className="text-sm m-0" style={{ color: "#808080cc" }}>
							{content.subtitle}
						</p>
					</div>
					<Button onClick={handleNewDraft} data-testid="new-article-button">
						<Plus className="h-4 w-4 mr-2" />
						{content.newDraft}
					</Button>
				</div>

				{/* Filter Cards */}
				<div className="flex gap-4 mb-6 flex-wrap" data-testid="filter-cards">
					<FilterCard
						title={content.filterAllArticles}
						count={
							docs.length +
							draftCounts.myNewDrafts +
							draftCounts.mySharedNewDrafts +
							draftCounts.sharedWithMe
						}
						icon={Inbox}
						selected={draftFilter === "all"}
						onClick={() => setDraftFilter("all")}
						testId="filter-card-all"
					/>
					<FilterCard
						title={content.filterMyNewDrafts}
						count={draftCounts.myNewDrafts}
						icon={FileEdit}
						selected={draftFilter === "my-new-drafts"}
						onClick={() => setDraftFilter("my-new-drafts")}
						testId="filter-card-my-drafts"
					/>
					<FilterCard
						title={content.filterSharedWithMe}
						count={draftCounts.sharedWithMe}
						icon={Share2}
						selected={draftFilter === "shared-with-me"}
						onClick={() => setDraftFilter("shared-with-me")}
						testId="filter-card-shared"
					/>
					<FilterCard
						title={content.filterSuggestedUpdates}
						count={draftCounts.suggestedUpdates}
						icon={Sparkles}
						selected={draftFilter === "suggested-updates"}
						onClick={() => setDraftFilter("suggested-updates")}
						testId="filter-card-suggested"
					/>
				</div>

				{/* Search and Filter */}
				<div className="flex gap-4 mb-6 flex-wrap">
					<div className="relative flex-1 min-w-[200px] max-w-80">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							placeholder={content.searchPlaceholder.value}
							value={searchQuery}
							onChange={e => setSearchQuery(e.target.value)}
							className="pl-9 search-input"
						/>
					</div>
					<SelectBox
						value={filterSpace || "default"}
						onValueChange={v => setFilterSpace(v === "default" ? "" : v)}
						placeholder={content.spaceFilterPlaceholder.value}
						options={[
							{ value: "default", label: content.spaceFilterDefault.value },
							{ value: "/root", label: content.spaceFilterRoot.value },
						]}
						width="140px"
						className="space-select-trigger"
						data-testid="space-filter"
					/>
				</div>

				{/* Articles and Drafts List */}
				{loading ? (
					<div className="text-center py-12 text-muted-foreground">{content.loading}</div>
				) : listItems.length === 0 ? (
					<div className="text-center py-12 text-muted-foreground">
						{searchQuery || filterSpace !== "" ? content.noResults : content.noArticles}
					</div>
				) : (
					<div className="space-y-4">
						{listItems.map(item => {
							if (item.type === "draft") {
								const draft = item.data;
								return (
									<div
										key={`draft-${draft.id}`}
										className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors max-w-full cursor-pointer"
										onClick={() => navigate(`/article-draft/${draft.id}`)}
										data-testid={`draft-row-${draft.id}`}
									>
										<div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1 overflow-hidden">
											<div className="flex-shrink-0 text-muted-foreground">
												<FileEdit className="h-5 w-5" />
											</div>
											<div className="flex-1 min-w-0 overflow-hidden">
												<h3 className="font-medium text-foreground mb-1 truncate">
													{draft.title || content.untitled}
												</h3>
												<div className="flex items-center gap-2 text-sm text-muted-foreground overflow-hidden">
													<span className="whitespace-nowrap truncate">
														{content.lastUpdated}{" "}
														{formatTimestamp(dateTimeContent, draft.updatedAt)}
													</span>
												</div>
											</div>
										</div>
										<div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-3 md:flex-shrink-0 w-full md:w-auto">
											<Badge
												variant="secondary"
												className="bg-purple-500/10 text-purple-700 dark:text-purple-400"
											>
												{content.draft}
											</Badge>
											{draft.isShared && (
												<Badge
													variant="secondary"
													className="bg-blue-500/10 text-blue-700 dark:text-blue-400"
												>
													{content.shared}
												</Badge>
											)}
											{draft.createdByAgent && (
												<Badge
													variant="secondary"
													className="bg-amber-500/10 text-amber-700 dark:text-amber-400"
												>
													{content.aiDraft}
												</Badge>
											)}
											{/* v8 ignore start -- unreachable: buildListItems filters out drafts with docId */}
											{draft.docId && (
												<Badge
													variant="secondary"
													className="bg-green-500/10 text-green-700 dark:text-green-400"
												>
													{content.editing}
												</Badge>
											)}
											{/* v8 ignore stop */}
											<div className="flex items-center gap-2 flex-shrink-0">
												<Button
													variant="outline"
													size="sm"
													onClick={e => {
														e.stopPropagation();
														navigate(`/article-draft/${draft.id}`);
													}}
													data-testid="edit-draft-button"
												>
													<Edit className="h-4 w-4 mr-2" />
													{content.editButton}
												</Button>
												<Button
													variant="ghost"
													size="icon"
													className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
													onClick={e => {
														e.stopPropagation();
														handleDeleteDraftFromList(draft.id, draft.title);
													}}
													data-testid={`delete-draft-button-${draft.id}`}
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</div>
										</div>
									</div>
								);
							}

							// Article item
							const doc = item.data;
							const metadata = (doc.contentMetadata as DocContentMetadata | undefined) ?? {};
							const Icon = getSourceIcon(metadata.sourceName ?? "");

							return (
								<div
									key={`article-${doc.id}`}
									className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors max-w-full"
								>
									<div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1 overflow-hidden">
										<div className="flex-shrink-0 text-muted-foreground">
											<Icon className="h-5 w-5" />
										</div>

										<div className="flex-1 min-w-0 overflow-hidden">
											<h3 className="font-medium text-foreground mb-1 truncate">
												{metadata.title ?? content.untitled}
											</h3>
											<div className="flex items-center gap-2 text-sm text-muted-foreground overflow-hidden">
												<span className="whitespace-nowrap flex-shrink-0">
													{metadata.sourceName ?? content.unknownSource}
												</span>
												<span className="flex-shrink-0">•</span>
												<span className="whitespace-nowrap truncate">
													{content.lastUpdated}{" "}
													{formatTimestamp(dateTimeContent, doc.updatedAt)}
												</span>
											</div>
										</div>
									</div>

									<div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-3 md:flex-shrink-0 w-full md:w-auto">
										{metadata.isSourceDoc && (
											<div className="flex justify-start flex-shrink-0">
												<Badge
													variant="outline"
													className="text-xs"
													data-testid="source-doc-badge"
												>
													<FileUp className="h-3 w-3 mr-1" />
													{content.sourceDocBadge}
												</Badge>
											</div>
										)}
										{isNonMarkdownContentType(doc.contentType) && (
											<div className="flex justify-start flex-shrink-0">
												<Badge
													variant="secondary"
													className="bg-blue-500/10 text-blue-700 dark:text-blue-400"
													data-testid="content-type-badge"
												>
													{getContentTypeLabel(doc.contentType, {
														typeMarkdown: content.typeMarkdown.value,
														typeJson: content.typeJson.value,
														typeYaml: content.typeYaml.value,
													})}
												</Badge>
											</div>
										)}
										{metadata.status && (
											<div className="flex justify-start flex-shrink-0">
												{getStatusBadge(metadata.status, metadata.commitsAhead, {
													upToDate: content.statusUpToDate,
													needsUpdate: content.statusNeedsUpdate,
													underReview: content.statusUnderReview,
													statusNeedsUpdateWithCommits: content.statusNeedsUpdateWithCommits,
												})}
											</div>
										)}
										{articlesWithSuggestionsIds.has(doc.id) && (
											<>
												<Badge
													variant="secondary"
													className="bg-purple-500/10 text-purple-700 dark:text-purple-400"
												>
													{content.draft}
												</Badge>
												<Badge
													variant="secondary"
													className="bg-green-500/10 text-green-700 dark:text-green-400"
												>
													{content.editing}
												</Badge>
												<Badge
													variant="secondary"
													className="bg-amber-500/10 text-amber-700 dark:text-amber-400"
													data-testid="suggested-updates-badge"
												>
													{content.hasSuggestedUpdates}
												</Badge>
											</>
										)}
										{metadata.qualityScore !== undefined && (
											<div className="text-sm whitespace-nowrap flex items-center flex-shrink-0">
												<span className="text-muted-foreground hidden md:inline">
													{content.qualityScore}{" "}
												</span>
												<span
													className={`font-semibold ${
														metadata.qualityScore >= 70
															? "text-green-600 dark:text-green-400"
															: metadata.qualityScore >= 40
																? "text-yellow-600 dark:text-yellow-400"
																: "text-red-600 dark:text-red-400"
													}`}
												>
													{metadata.qualityScore}%
												</span>
											</div>
										)}
										<div className="flex items-center gap-2 flex-shrink-0">
											{!metadata.isSourceDoc && (
												<Button
													variant="outline"
													/* v8 ignore next 4 - onclick arrow function and handler */
													size="sm"
													onClick={() => {
														/* v8 ignore next 2 - arrow function onclick handler */
														handleEditArticle(doc.jrn);
													}}
													data-testid="edit-article-button"
												>
													<Edit className="h-4 w-4 mr-2" />
													{content.editButton}
												</Button>
											)}
											<Button
												variant="outline"
												size="sm"
												onClick={() => {
													navigate(`/articles/${encodeURIComponent(doc.jrn)}`);
												}}
											>
												{content.reviewButton}
											</Button>
											<Button
												variant="ghost"
												size="icon"
												className="h-8 w-8"
												onClick={() => {
													open(`/articles/${encodeURIComponent(doc.jrn)}/preview`);
												}}
											>
												<ExternalLink className="h-4 w-4" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
												onClick={() => {
													handleDeleteArticle(
														doc.jrn,
														metadata.title ?? content.untitled.value,
													);
												}}
												disabled={deleting === doc.jrn}
												data-testid={`delete-article-button-${doc.jrn}`}
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</>
	);
}

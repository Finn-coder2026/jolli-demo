import { Button } from "../../components/ui/Button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/Tabs";
import { useClient } from "../../contexts/ClientContext";
import { getLog } from "../../util/Logger";
import { ArticlePicker } from "./ArticlePicker";
import { RepositoryViewer } from "./RepositoryViewer";
import type { Doc, SiteMetadata, SiteWithUpdate } from "jolli-common";
import { FileText, FolderTree, Info } from "lucide-react";
import { type ReactElement, type ReactNode, useEffect, useMemo, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

interface SiteContentTabProps {
	docsite: SiteWithUpdate;
	onDocsiteUpdate: (updatedSite: SiteWithUpdate) => void;
	/** Callback when a repository file is saved */
	onFileSave?: () => void;
}

/**
 * Site Content Tab - Manages articles, navigation, and images in a unified view.
 * Uses sub-tabs for organization while keeping a clean, focused interface.
 */
export function SiteContentTab({ docsite, onDocsiteUpdate, onFileSave }: SiteContentTabProps): ReactElement {
	const content = useIntlayer("site-content-tab");
	const client = useClient();

	// Articles state
	const [allArticles, setAllArticles] = useState<Array<Doc>>([]);
	const [loadingArticles, setLoadingArticles] = useState(true);
	const [includeAll, setIncludeAll] = useState(true);
	const [selectedArticleJrns, setSelectedArticleJrns] = useState<Set<string>>(new Set());
	const [originalIncludeAll, setOriginalIncludeAll] = useState(true);
	const [originalSelectedJrns, setOriginalSelectedJrns] = useState<Set<string>>(new Set());
	const [savingArticles, setSavingArticles] = useState(false);
	const [articleSaveMessage, setArticleSaveMessage] = useState<{ type: "success" | "error"; text: ReactNode } | null>(
		null,
	);

	// Get selected JRNs for dependency tracking
	const metadata = docsite.metadata as SiteMetadata | undefined;
	const selectedJrnsKey = JSON.stringify(metadata?.selectedArticleJrns || []);

	// Initialize article selection state from docsite
	useEffect(() => {
		const siteSelectedJrns = metadata?.selectedArticleJrns;
		const isIncludeAll = siteSelectedJrns === null || siteSelectedJrns === undefined;
		setIncludeAll(isIncludeAll);
		setOriginalIncludeAll(isIncludeAll);
		const jrnSet = new Set(siteSelectedJrns || []);
		setSelectedArticleJrns(jrnSet);
		setOriginalSelectedJrns(jrnSet);
	}, [docsite.id, selectedJrnsKey]);

	// Load all articles
	useEffect(() => {
		let mounted = true;

		async function loadArticles() {
			try {
				setLoadingArticles(true);
				const docs = await client.docs().listDocs();
				if (mounted) {
					setAllArticles(docs);
				}
			} catch (error) {
				if (mounted) {
					log.error(error, "Failed to fetch articles");
				}
			} finally {
				if (mounted) {
					setLoadingArticles(false);
				}
			}
		}

		loadArticles();

		return () => {
			mounted = false;
		};
	}, [docsite.id]);

	const hasArticleChanges = useMemo(() => {
		if (includeAll !== originalIncludeAll) {
			return true;
		}
		if (!includeAll) {
			if (selectedArticleJrns.size !== originalSelectedJrns.size) {
				return true;
			}
			for (const jrn of selectedArticleJrns) {
				if (!originalSelectedJrns.has(jrn)) {
					return true;
				}
			}
		}
		return false;
	}, [includeAll, originalIncludeAll, selectedArticleJrns, originalSelectedJrns]);

	async function handleSaveArticles() {
		try {
			setSavingArticles(true);
			setArticleSaveMessage(null);

			const newSelectedJrns = includeAll ? null : Array.from(selectedArticleJrns);
			const updatedSite = await client.sites().updateSiteArticles(docsite.id, newSelectedJrns);

			onDocsiteUpdate(updatedSite);

			setOriginalIncludeAll(includeAll);
			setOriginalSelectedJrns(new Set(selectedArticleJrns));

			setArticleSaveMessage({ type: "success", text: content.selectionSaved });
			setTimeout(() => setArticleSaveMessage(null), 3000);
		} catch (error) {
			log.error(error, "Failed to save article selection");
			setArticleSaveMessage({ type: "error", text: content.selectionFailed });
		} finally {
			setSavingArticles(false);
		}
	}

	function handleArticleSelectionChange(jrns: Set<string>) {
		setSelectedArticleJrns(jrns);
	}

	function handleIncludeAllChange(newIncludeAll: boolean) {
		setIncludeAll(newIncludeAll);
		if (!newIncludeAll && selectedArticleJrns.size === 0 && allArticles.length > 0) {
			setSelectedArticleJrns(new Set(allArticles.map(a => a.jrn)));
		}
	}

	// Check if we have a GitHub repo for navigation editing
	const hasGitHubRepo = Boolean(docsite.metadata?.githubRepo && docsite.metadata?.githubUrl);

	return (
		<div className="space-y-4">
			<Tabs defaultValue="articles" className="w-full">
				<TabsList className="mb-4">
					<TabsTrigger
						value="articles"
						className="flex items-center gap-2"
						data-testid="content-tab-articles"
					>
						<FileText className="h-4 w-4" />
						{content.tabArticles}
					</TabsTrigger>
					<TabsTrigger
						value="navigation"
						className="flex items-center gap-2"
						data-testid="content-tab-navigation"
					>
						<FolderTree className="h-4 w-4" />
						{content.tabNavigation}
					</TabsTrigger>
				</TabsList>

				{/* Articles Tab */}
				<TabsContent value="articles" className="space-y-4">
					<p className="text-sm text-muted-foreground">{content.articlesDescription}</p>

					{loadingArticles ? (
						<div className="py-8 text-center text-muted-foreground" data-testid="articles-loading">
							{content.loadingArticles}
						</div>
					) : (
						<>
							{/* Article Count Summary */}
							<div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
								<span className="text-sm">
									{includeAll ? (
										<span className="text-muted-foreground">{content.includeAllDescription}</span>
									) : (
										<span>
											<strong>{selectedArticleJrns.size}</strong>{" "}
											<span className="text-muted-foreground">{content.selectedCount}</span>
										</span>
									)}
								</span>
								{hasArticleChanges && (
									<span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
										{content.unsavedChanges}
									</span>
								)}
							</div>

							{/* Article Picker */}
							<ArticlePicker
								articles={allArticles}
								selectedJrns={selectedArticleJrns}
								onSelectionChange={handleArticleSelectionChange}
								includeAll={includeAll}
								onIncludeAllChange={handleIncludeAllChange}
								disabled={savingArticles}
							/>

							{/* Save Section */}
							<div className="space-y-3 pt-4 border-t">
								<div className="flex items-center justify-between">
									<div>
										{articleSaveMessage && (
											<span
												className={`text-sm ${
													articleSaveMessage.type === "success"
														? "text-green-600 dark:text-green-400"
														: "text-red-600 dark:text-red-400"
												}`}
												data-testid="article-save-message"
											>
												{articleSaveMessage.text}
											</span>
										)}
									</div>
									<Button
										onClick={handleSaveArticles}
										disabled={savingArticles || !hasArticleChanges}
										data-testid="save-articles-button"
									>
										{savingArticles
											? content.saving
											: hasArticleChanges
												? content.saveSelection
												: content.noChanges}
									</Button>
								</div>

								{/* Rebuild reminder - shown after successful save or when there are changes */}
								{(articleSaveMessage?.type === "success" || hasArticleChanges) && (
									<div
										className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
										data-testid="articles-rebuild-note"
									>
										<Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
										<span className="text-xs text-amber-700 dark:text-amber-300">
											{content.rebuildNote}
										</span>
									</div>
								)}
							</div>
						</>
					)}
				</TabsContent>

				{/* Navigation Tab */}
				<TabsContent value="navigation" className="space-y-4">
					<p className="text-sm text-muted-foreground">{content.navigationDescription}</p>

					{hasGitHubRepo ? (
						<RepositoryViewer docsite={docsite} onFileSave={onFileSave} />
					) : (
						<div className="border rounded-lg p-8 text-center">
							<FolderTree className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
							<p className="text-sm text-muted-foreground">{content.noNavigationFile}</p>
						</div>
					)}
				</TabsContent>
			</Tabs>
		</div>
	);
}

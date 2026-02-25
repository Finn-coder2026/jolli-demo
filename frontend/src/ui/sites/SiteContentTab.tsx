import { Button } from "../../components/ui/Button";
import { toast } from "../../components/ui/Sonner";
import { useClient } from "../../contexts/ClientContext";
import { getLog } from "../../util/Logger";
import { ArticlePicker } from "./ArticlePicker";
import { SectionHeader } from "./SectionHeader";
import type { Doc, SiteMetadata, SiteWithUpdate, Space } from "jolli-common";
import { FileText, Info } from "lucide-react";
import { type ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

interface SiteContentTabProps {
	docsite: SiteWithUpdate;
	onDocsiteUpdate: (updatedSite: SiteWithUpdate) => void;
}

export function SiteContentTab({ docsite, onDocsiteUpdate }: SiteContentTabProps): ReactElement {
	const content = useIntlayer("site-content-tab");
	const client = useClient();

	const [allArticles, setAllArticles] = useState<Array<Doc>>([]);
	const [spaces, setSpaces] = useState<Array<Space>>([]);
	const [loadingArticles, setLoadingArticles] = useState(true);
	const [includeAll, setIncludeAll] = useState(false);
	const [selectedArticleJrns, setSelectedArticleJrns] = useState<Set<string>>(new Set());
	const [originalIncludeAll, setOriginalIncludeAll] = useState(false);
	const [originalSelectedJrns, setOriginalSelectedJrns] = useState<Set<string>>(new Set());
	const [articlesLoaded, setArticlesLoaded] = useState(false);
	const [savingArticles, setSavingArticles] = useState(false);

	const onDocsiteUpdateRef = useRef(onDocsiteUpdate);
	useEffect(() => {
		onDocsiteUpdateRef.current = onDocsiteUpdate;
	}, [onDocsiteUpdate]);

	const metadata = docsite.metadata as SiteMetadata | undefined;
	const selectedJrnsKey = useMemo(
		() => JSON.stringify(metadata?.selectedArticleJrns || []),
		[metadata?.selectedArticleJrns],
	);

	const changedJrns = useMemo(() => {
		if (!docsite.changedArticles || docsite.changedArticles.length === 0) {
			return;
		}
		return new Set(docsite.changedArticles.map(article => article.jrn));
	}, [docsite.changedArticles]);

	// Tracks the initialization key to prevent the selection effect from re-running
	// unnecessarily when allArticles or articlesLoaded change but the selection source
	// (docsite.id + selectedJrnsKey) hasn't changed.
	const selectionInitRef = useRef<string | null>(null);

	// Initialize article selection state from docsite metadata.
	// When selectedArticleJrns is null/undefined (backend "include all"), we default the toggle
	// to OFF and select all articles individually once they load. This makes the UI explicit
	// about what's included rather than hiding it behind an opaque "all" toggle.
	useEffect(() => {
		const currentKey = `${docsite.id}:${selectedJrnsKey}`;
		if (selectionInitRef.current === currentKey) {
			return;
		}

		const siteSelectedJrns = metadata?.selectedArticleJrns;
		const hasExplicitSelection = siteSelectedJrns !== null && siteSelectedJrns !== undefined;

		if (hasExplicitSelection) {
			// Explicit selection from server
			setIncludeAll(false);
			setOriginalIncludeAll(false);
			const jrnSet = new Set(siteSelectedJrns);
			setSelectedArticleJrns(jrnSet);
			setOriginalSelectedJrns(jrnSet);
			selectionInitRef.current = currentKey;
		} else if (articlesLoaded && allArticles.length > 0) {
			// No explicit selection (null) and articles loaded — select all individually
			setIncludeAll(false);
			setOriginalIncludeAll(false);
			const allJrns = new Set(allArticles.map(a => a.jrn));
			setSelectedArticleJrns(allJrns);
			setOriginalSelectedJrns(allJrns);
			selectionInitRef.current = currentKey;
		}
	}, [docsite.id, selectedJrnsKey, articlesLoaded, allArticles, metadata?.selectedArticleJrns]);

	useEffect(() => {
		let mounted = true;

		async function loadArticlesAndSpaces() {
			try {
				setLoadingArticles(true);
				// Fetch articles and spaces in parallel
				const [docs, spacesList] = await Promise.all([client.docs().listDocs(), client.spaces().listSpaces()]);
				if (mounted) {
					setAllArticles(docs);
					setSpaces(spacesList);
				}
			} catch (error) {
				if (mounted) {
					log.error(error, "Failed to fetch articles or spaces");
				}
			} finally {
				if (mounted) {
					setLoadingArticles(false);
					setArticlesLoaded(true);
				}
			}
		}

		loadArticlesAndSpaces();

		return () => {
			mounted = false;
		};
	}, [docsite.id, client]);

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

			const newSelectedJrns = includeAll ? null : Array.from(selectedArticleJrns);
			const updatedSite = await client.sites().updateSiteArticles(docsite.id, newSelectedJrns);

			onDocsiteUpdateRef.current(updatedSite);

			setOriginalIncludeAll(includeAll);
			setOriginalSelectedJrns(new Set(selectedArticleJrns));

			toast.success(content.selectionSaved.value);
		} catch (error) {
			log.error(error, "Failed to save article selection");
			toast.error(content.selectionFailed.value);
		} finally {
			setSavingArticles(false);
		}
	}

	function handleIncludeAllChange(newIncludeAll: boolean) {
		setIncludeAll(newIncludeAll);
		if (!newIncludeAll && selectedArticleJrns.size === 0 && allArticles.length > 0) {
			setSelectedArticleJrns(new Set(allArticles.map(a => a.jrn)));
		}
	}

	return (
		<div className="p-6 space-y-6">
			<SectionHeader icon={FileText} title={content.articlesTitle} description={content.articlesDescription} />

			{loadingArticles ? (
				<div className="py-8 text-center text-muted-foreground" data-testid="articles-loading">
					{content.loadingArticles}
				</div>
			) : (
				<>
					<div className="flex items-center justify-between px-3 py-2.5 bg-muted/30 rounded-lg">
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

					<ArticlePicker
						articles={allArticles}
						selectedJrns={selectedArticleJrns}
						onSelectionChange={setSelectedArticleJrns}
						includeAll={includeAll}
						onIncludeAllChange={handleIncludeAllChange}
						disabled={savingArticles}
						spaces={spaces}
						changedJrns={changedJrns}
					/>

					<div className="flex items-center justify-between pt-4 border-t">
						{hasArticleChanges && (
							<div
								className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400"
								data-testid="articles-rebuild-note"
							>
								<Info className="h-3.5 w-3.5 flex-shrink-0" />
								<span>{content.rebuildNote}</span>
							</div>
						)}
						{!hasArticleChanges && <div />}
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
				</>
			)}
		</div>
	);
}

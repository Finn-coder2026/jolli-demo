import { MarkdownContent } from "../components/MarkdownContent";
import { Button } from "../components/ui/Button";
import { TogglePill } from "../components/ui/TogglePill";
import { SpaceImageProvider } from "../context/SpaceImageContext";
import { useClient } from "../contexts/ClientContext";
import { useNavigation } from "../contexts/NavigationContext";
import { stripJolliScriptFrontmatter } from "../util/ContentUtil";
import { getLog } from "../util/Logger";
import type { Doc, DocContentMetadata, DocDraftWithPendingChanges } from "jolli-common";
import { ChevronDown, ChevronLeft, ChevronRight, Code, Edit, FileText } from "lucide-react";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

interface PreviewProps {
	readonly jrn: string;
}

export function Preview({ jrn }: PreviewProps): ReactElement {
	const client = useClient();
	const content = useIntlayer("preview");
	const { navigate } = useNavigation();
	const [doc, setDoc] = useState<Doc | null>(null);
	const [loading, setLoading] = useState(true);
	const [viewMode, setViewMode] = useState<"rendered" | "raw">("rendered");
	const [draftWithChanges, setDraftWithChanges] = useState<DocDraftWithPendingChanges | null>(null);
	const [isNavigatingToEdit, setIsNavigatingToEdit] = useState(false);
	const [showSuggestions, setShowSuggestions] = useState(false);
	const [currentSuggestionIndex, setCurrentSuggestionIndex] = useState(0);

	useEffect(() => {
		const fetchArticle = async () => {
			try {
				const data = await client.docs().findDoc(jrn);
				setDoc(data ?? null);

				if (data) {
					const draftsWithChanges = await client.docDrafts().getDraftsWithPendingChanges();
					const matchingDraft = draftsWithChanges.find(d => d.draft.docId === data.id);
					setDraftWithChanges(matchingDraft ?? null);
				}
			} catch (error) {
				log.error(error, "Error fetching article:");
				setDoc(null);
			} finally {
				setLoading(false);
			}
		};

		fetchArticle().then();
	}, [jrn]);

	async function handleEditArticle() {
		if (!doc) {
			return;
		}
		setIsNavigatingToEdit(true);
		try {
			if (draftWithChanges) {
				navigate(`/articles?edit=${draftWithChanges.draft.id}`);
			} else {
				const draft = await client.docs().createDraftFromArticle(doc.jrn);
				await new Promise(resolve => setTimeout(resolve, 100));
				navigate(`/articles?edit=${draft.id}`);
			}
		} catch (error) {
			log.error(error, "Failed to create draft from article.");
			setIsNavigatingToEdit(false);
		}
	}

	const suggestionCount = draftWithChanges?.pendingChangesCount ?? 0;
	const hasSuggestions = suggestionCount > 0;

	function handleToggleSuggestions() {
		setShowSuggestions(!showSuggestions);
	}

	function handlePreviousSuggestion() {
		if (currentSuggestionIndex > 0) {
			setCurrentSuggestionIndex(currentSuggestionIndex - 1);
		}
	}

	function handleNextSuggestion() {
		if (currentSuggestionIndex < suggestionCount - 1) {
			setCurrentSuggestionIndex(currentSuggestionIndex + 1);
		}
	}

	if (loading) {
		return (
			<div className="min-h-screen bg-background p-8">
				<div className="max-w-4xl mx-auto">
					<div className="text-center text-foreground text-2xl">{content.loadingPreview({ jrn })}</div>
				</div>
			</div>
		);
	}

	if (!doc) {
		return (
			<div className="min-h-screen bg-background p-8">
				<div className="max-w-4xl mx-auto">
					<div className="text-center">
						<h1 className="text-2xl font-bold text-foreground mb-2">{content.articleNotFound}</h1>
						<p className="text-muted-foreground">{content.couldNotLoadArticle({ jrn })}</p>
					</div>
				</div>
			</div>
		);
	}

	const metadata = doc.contentMetadata as DocContentMetadata | undefined;

	const lastUpdatedDate = new Date(doc.updatedAt).toLocaleDateString();

	return (
		<div className="min-h-screen bg-background p-8">
			<div className="max-w-4xl mx-auto">
				<div className="bg-card rounded-lg border p-8">
					{/* Header */}
					<div className="mb-6 pb-6 border-b">
						<div className="flex items-start justify-between gap-4">
							<div className="flex-1">
								<h1 className="text-3xl font-bold mb-2">{metadata?.title || content.untitled}</h1>
								{metadata?.sourceName && (
									<p className="text-sm text-muted-foreground">
										{content.source} {metadata.sourceName}
									</p>
								)}
							</div>
							<div className="flex items-center gap-2">
								{hasSuggestions ? (
									<div
										className="flex items-center rounded-md border border-input transition-all duration-200"
										data-testid="edit-button-container"
									>
										<Button
											variant="ghost"
											size="sm"
											onClick={handleEditArticle}
											disabled={isNavigatingToEdit}
											data-testid="edit-article-button"
											className={`gap-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 ${
												showSuggestions ? "rounded-r-none" : ""
											}`}
										>
											<Edit className="h-4 w-4" />
											{content.edit} ({suggestionCount}{" "}
											{suggestionCount === 1 ? content.suggestion : content.suggestions})
										</Button>
										{showSuggestions && (
											<>
												<div
													className="h-4 w-px bg-amber-500/30"
													data-testid="suggestion-divider"
												/>
												<div className="flex items-center gap-0.5 px-1">
													<span
														className="text-xs text-amber-600 dark:text-amber-400 px-1"
														data-testid="suggestion-counter"
													>
														{currentSuggestionIndex + 1}/{suggestionCount}
													</span>
													<Button
														variant="ghost"
														size="icon"
														className="h-6 w-6 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400"
														onClick={handlePreviousSuggestion}
														disabled={currentSuggestionIndex === 0}
														data-testid="previous-suggestion-button"
													>
														<ChevronLeft className="h-3.5 w-3.5" />
													</Button>
													<Button
														variant="ghost"
														size="icon"
														className="h-6 w-6 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400"
														onClick={handleNextSuggestion}
														disabled={currentSuggestionIndex === suggestionCount - 1}
														data-testid="next-suggestion-button"
													>
														<ChevronRight className="h-3.5 w-3.5" />
													</Button>
												</div>
											</>
										)}
										<Button
											variant="ghost"
											size="icon"
											className="h-6 w-6 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 mr-1"
											onClick={handleToggleSuggestions}
											data-testid="toggle-suggestions-button"
										>
											{showSuggestions ? (
												<ChevronDown className="h-3.5 w-3.5" />
											) : (
												<ChevronRight className="h-3.5 w-3.5" />
											)}
										</Button>
									</div>
								) : (
									<Button
										variant="outline"
										size="sm"
										onClick={handleEditArticle}
										disabled={isNavigatingToEdit}
										data-testid="edit-article-button"
										className="gap-1.5"
									>
										<Edit className="h-4 w-4" />
										{content.edit}
									</Button>
								)}
								<TogglePill
									options={[
										{
											value: "rendered",
											label: content.rendered.value,
											icon: <FileText className="h-4 w-4" />,
										},
										{
											value: "raw",
											label: content.sourceView.value,
											icon: <Code className="h-4 w-4" />,
										},
									]}
									value={viewMode}
									onChange={value => setViewMode(value as "rendered" | "raw")}
								/>
							</div>
						</div>
					</div>

					{/* Content */}
					<div>
						{viewMode === "raw" ? (
							<pre className="bg-muted p-4 rounded-md overflow-x-auto text-sm whitespace-pre-wrap">
								<code>{stripJolliScriptFrontmatter(doc.content)}</code>
							</pre>
						) : (
							<SpaceImageProvider spaceId={doc.spaceId ?? undefined}>
								<MarkdownContent>{stripJolliScriptFrontmatter(doc.content)}</MarkdownContent>
							</SpaceImageProvider>
						)}
					</div>

					{/* Footer */}
					<div className="mt-8 pt-6 border-t text-sm text-muted-foreground">
						<div className="flex justify-between items-center">
							<div>{content.lastUpdated({ date: lastUpdatedDate })}</div>
							<div>{content.version({ version: doc.version })}</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

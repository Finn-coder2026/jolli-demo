import { UserAvatar } from "../../components/UserAvatar";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { useClient } from "../../contexts/ClientContext";
import { useNavigation } from "../../contexts/NavigationContext";
import { formatTimestamp } from "../../util/DateTimeUtil";
import { getLog } from "../../util/Logger";
import type { Doc, DocDraft, DocDraftSectionChanges } from "jolli-common";
import { ChevronDown, ChevronUp, Edit, FileEdit, Trash2 } from "lucide-react";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

function getContentTypeLabel(
	contentType: string | undefined,
	labels: { typeMarkdown: string; typeJson: string; typeYaml: string },
): string {
	switch (contentType) {
		case "application/json":
			return labels.typeJson;
		case "application/yaml":
			return labels.typeYaml;
		/* v8 ignore next 2 -- unreachable: only called when isNonMarkdownContentType is true */
		default:
			return labels.typeMarkdown;
	}
}

function isNonMarkdownContentType(contentType: string | undefined): boolean {
	return contentType === "application/json" || contentType === "application/yaml";
}

export interface DraftListSectionProps {
	limit?: number;
}

export function DraftListSection({ limit = 5 }: DraftListSectionProps): ReactElement {
	const content = useIntlayer("draft-list-section");
	const articleDraftsContent = useIntlayer("article-drafts");
	const dateTimeContent = useIntlayer("date-time");
	const client = useClient();
	const { navigate } = useNavigation();
	const [drafts, setDrafts] = useState<Array<DocDraft>>([]);
	const [articles, setArticles] = useState<Map<number, Doc>>(new Map());
	const [sectionChanges, setSectionChanges] = useState<Map<number, Array<DocDraftSectionChanges>>>(new Map());
	const [loading, setLoading] = useState(true);
	const [expanded, setExpanded] = useState(true);
	const [hasMore, setHasMore] = useState(false);

	useEffect(() => {
		fetchDrafts().then();
	}, []);

	async function fetchDrafts() {
		try {
			const data = await client.docDrafts().listDocDrafts(limit + 1, 0);
			setHasMore(data.length > limit);
			const draftsList = data.slice(0, limit);
			setDrafts(draftsList);

			// Fetch articles for drafts that are editing existing articles
			const draftsWithDocId = draftsList.filter(draft => draft.docId);
			if (draftsWithDocId.length > 0) {
				try {
					const allDocs = await client.docs().listDocs();
					const articlesMap = new Map<number, Doc>();
					for (const draft of draftsWithDocId) {
						if (draft.docId) {
							const article = allDocs.find(doc => doc.id === draft.docId);
							if (article) {
								articlesMap.set(draft.docId, article);
							}
						}
					}
					setArticles(articlesMap);
				} catch (error) {
					log.error(error, "Failed to fetch articles for drafts.");
				}
			}

			// Fetch section changes for all drafts
			const changesMap = new Map<number, Array<DocDraftSectionChanges>>();
			await Promise.all(
				draftsList.map(async draft => {
					try {
						const response = await client.docDrafts().getSectionChanges(draft.id);
						if (response.changes.length > 0) {
							changesMap.set(draft.id, response.changes);
						}
					} catch (error) {
						log.error(error, `Failed to fetch section changes for draft ${draft.id}.`);
					}
				}),
			);
			setSectionChanges(changesMap);
		} catch (error) {
			log.error(error, "Failed to fetch drafts.");
		} finally {
			setLoading(false);
		}
	}

	function handleViewAll() {
		navigate("/draft-articles");
	}

	function handleEditDraft(draftId: number) {
		navigate(`/article-draft/${draftId}`);
	}

	async function handleDeleteDraft(draftId: number) {
		const confirmed = window.confirm(content.confirmDelete.value);

		if (!confirmed) {
			return;
		}

		try {
			await client.docDrafts().deleteDocDraft(draftId);
			await fetchDrafts();
		} catch (error) {
			log.error(error, "Failed to delete draft.");
		}
	}

	return (
		<div className="bg-card rounded-lg border mb-6">
			{/* Header */}
			<div className="p-4 border-b">
				<button
					onClick={() => setExpanded(!expanded)}
					className="flex items-center gap-2 w-full text-left hover:opacity-80 transition-opacity"
					data-testid="drafts-section-toggle"
				>
					{expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
					<div>
						<h2 className="font-semibold text-lg">{content.draftsTitle}</h2>
						<p className="text-sm text-muted-foreground">{content.draftsSubtitle}</p>
					</div>
				</button>
			</div>

			{/* Content */}
			{expanded && (
				<div className="p-4">
					{loading ? (
						<div className="text-center py-8 text-muted-foreground" data-testid="drafts-loading">
							{articleDraftsContent.loadingDrafts}
						</div>
					) : drafts.length === 0 ? (
						<div className="text-center py-8" data-testid="no-drafts">
							<FileEdit className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
							<p className="font-medium text-muted-foreground">{articleDraftsContent.noDrafts}</p>
							<p className="text-sm text-muted-foreground mt-1">{articleDraftsContent.noDraftsDesc}</p>
						</div>
					) : (
						<>
							<div className="space-y-3">
								{drafts.map(draft => (
									<div
										key={draft.id}
										className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
										data-testid={`draft-item-${draft.id}`}
									>
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2">
												<h3 className="font-medium truncate">{draft.title}</h3>
												{isNonMarkdownContentType(draft.contentType) && (
													<Badge
														variant="secondary"
														className="bg-blue-500/10 text-blue-700 dark:text-blue-400 text-[10px] px-1.5 py-0"
														data-testid="draft-content-type-badge"
													>
														{getContentTypeLabel(draft.contentType, {
															typeMarkdown: content.typeMarkdown.value,
															typeJson: content.typeJson.value,
															typeYaml: content.typeYaml.value,
														})}
													</Badge>
												)}
												{draft.isShared && (
													<Badge
														variant="secondary"
														className="bg-purple-500/10 text-purple-700 dark:text-purple-400 text-[10px] px-1.5 py-0"
														data-testid="draft-shared-badge"
													>
														{content.shared}
													</Badge>
												)}
												{draft.createdByAgent && (
													<Badge
														variant="secondary"
														className="bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] px-1.5 py-0"
														data-testid="draft-ai-badge"
													>
														{content.aiDraft}
													</Badge>
												)}
											</div>
											{draft.docId && articles.get(draft.docId) && (
												<div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 mt-1">
													<div className="flex items-center gap-1">
														<Edit className="h-3 w-3 flex-shrink-0" />
														<span className="truncate">
															{content.editing}{" "}
															{articles.get(draft.docId)?.contentMetadata?.title ??
																"Untitled"}
														</span>
													</div>
													{sectionChanges.has(draft.id) &&
														(sectionChanges
															.get(draft.id)
															?.filter(c => !c.applied && !c.dismissed).length ?? 0) >
															0 && (
															<Badge
																variant="secondary"
																className="bg-[rgba(255,180,0,0.2)] text-[rgb(180,120,0)] border-[rgba(255,180,0,0.5)] hover:bg-[rgba(255,180,0,0.3)] text-[10px] px-1.5 py-0"
															>
																{
																	sectionChanges
																		.get(draft.id)
																		?.filter(c => !c.applied && !c.dismissed).length
																}{" "}
																{content.suggestedEdits}
															</Badge>
														)}
												</div>
											)}
											<p className="text-sm text-muted-foreground mt-1">
												{articleDraftsContent.lastEdited}{" "}
												{formatTimestamp(dateTimeContent, draft.updatedAt)}
											</p>
										</div>

										<div className="flex items-center gap-3">
											<UserAvatar userId={draft.createdBy} size="small" />
											<Button
												variant="outline"
												size="sm"
												onClick={() => handleEditDraft(draft.id)}
												data-testid={`edit-draft-${draft.id}`}
											>
												{articleDraftsContent.editDraft}
											</Button>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => handleDeleteDraft(draft.id)}
												data-testid={`delete-draft-${draft.id}`}
												className="text-destructive hover:text-destructive hover:bg-destructive/10"
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
									</div>
								))}
							</div>

							{hasMore && (
								<div className="mt-4 text-center">
									<Button variant="link" onClick={handleViewAll} data-testid="view-all-drafts">
										{content.viewAllDrafts} →
									</Button>
								</div>
							)}
						</>
					)}
				</div>
			)}
		</div>
	);
}

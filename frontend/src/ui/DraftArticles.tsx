import { UserAvatar } from "../components/UserAvatar";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useClient } from "../contexts/ClientContext";
import { useNavigation } from "../contexts/NavigationContext";
import { formatTimestamp } from "../util/DateTimeUtil";
import { getLog } from "../util/Logger";
import type { DocDraft } from "jolli-common";
import { FileEdit, Search, Trash2 } from "lucide-react";
import { type ReactElement, useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

export function DraftArticles(): ReactElement {
	const content = useIntlayer("draft-articles");
	const articleDraftsContent = useIntlayer("article-drafts");
	const dateTimeContent = useIntlayer("date-time");
	const client = useClient();
	const { navigate } = useNavigation();
	const [drafts, setDrafts] = useState<Array<DocDraft>>([]);
	const [loading, setLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState("");
	const [deleting, setDeleting] = useState<number | null>(null);

	useEffect(() => {
		fetchDrafts().then();
	}, []);

	async function fetchDrafts() {
		try {
			const data = await client.docDrafts().listDocDrafts(100, 0);
			setDrafts(data);
		} catch (error) {
			log.error(error, "Failed to fetch drafts.");
		} finally {
			setLoading(false);
		}
	}

	async function handleDelete(draftId: number) {
		const draft = drafts.find(d => d.id === draftId);
		/* c8 ignore next 3 - defensive guard, unreachable as handleDelete only called with valid draft IDs from UI */
		if (!draft) {
			return;
		}

		if (!confirm(content.confirmDeleteDraft({ title: draft.title }).value)) {
			return;
		}

		setDeleting(draftId);
		try {
			await client.docDrafts().deleteDocDraft(draftId);
			setDrafts(prevDrafts => prevDrafts.filter(d => d.id !== draftId));
		} catch (error) {
			log.error(error, "Failed to delete draft.");
		} finally {
			setDeleting(null);
		}
	}

	function handleEdit(draftId: number) {
		navigate(`/article-draft/${draftId}`);
	}

	const filteredDrafts = drafts.filter(draft => {
		if (!searchQuery) {
			return true;
		}
		const query = searchQuery.toLowerCase();
		return draft.title.toLowerCase().includes(query) || draft.content.toLowerCase().includes(query);
	});

	return (
		<div
			className="bg-card rounded-lg p-6 border h-full overflow-auto max-w-full scrollbar-thin"
			data-testid="draft-articles-page"
		>
			<div className="mb-6">
				<h1 className="font-semibold" style={{ fontSize: "2rem", margin: "0 0 8px" }}>
					{content.allDraftsTitle}
				</h1>
				<p className="text-sm m-0" style={{ color: "#808080cc" }}>
					{content.allDraftsSubtitle}
				</p>
			</div>

			{/* Search */}
			<div className="flex gap-4 mb-6 flex-wrap">
				<div className="relative flex-1 min-w-[200px] max-w-80">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder={content.searchDraftsPlaceholder.value}
						value={searchQuery}
						onChange={e => setSearchQuery(e.target.value)}
						className="pl-9 search-input"
						data-testid="draft-search-input"
					/>
				</div>
			</div>

			{/* Drafts List */}
			{loading ? (
				<div className="text-center py-12 text-muted-foreground" data-testid="drafts-loading">
					{articleDraftsContent.loadingDrafts}
				</div>
			) : filteredDrafts.length === 0 ? (
				<div className="text-center py-12" data-testid="no-drafts-found">
					<FileEdit className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
					<p className="font-medium text-muted-foreground">
						{searchQuery ? content.noDraftsFound : articleDraftsContent.noDrafts}
					</p>
					<p className="text-sm text-muted-foreground mt-1">
						{searchQuery ? content.tryDifferentSearch : articleDraftsContent.noDraftsDesc}
					</p>
				</div>
			) : (
				<div className="space-y-4">
					{filteredDrafts.map(draft => (
						<div
							key={draft.id}
							className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors max-w-full"
							data-testid={`draft-row-${draft.id}`}
						>
							<div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1 overflow-hidden">
								<div className="flex-shrink-0 text-muted-foreground">
									<FileEdit className="h-5 w-5" />
								</div>

								<div className="flex-1 min-w-0 overflow-hidden">
									<h3 className="font-medium text-foreground mb-1 truncate">{draft.title}</h3>
									<div className="flex items-center gap-2 text-sm text-muted-foreground overflow-hidden">
										<span className="whitespace-nowrap truncate">
											{draft.content.slice(0, 100)}
											{draft.content.length > 100 ? "..." : ""}
										</span>
									</div>
									<div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
										<span className="whitespace-nowrap">
											{articleDraftsContent.lastEdited}{" "}
											{formatTimestamp(dateTimeContent, draft.updatedAt)}
										</span>
									</div>
								</div>
							</div>

							<div className="flex items-center gap-2 flex-shrink-0">
								<UserAvatar userId={draft.createdBy} size="small" />
								<Button
									variant="outline"
									size="sm"
									onClick={() => handleEdit(draft.id)}
									data-testid={`edit-draft-button-${draft.id}`}
								>
									{articleDraftsContent.editDraft}
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
									onClick={() => handleDelete(draft.id)}
									disabled={deleting === draft.id}
									data-testid={`delete-draft-button-${draft.id}`}
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

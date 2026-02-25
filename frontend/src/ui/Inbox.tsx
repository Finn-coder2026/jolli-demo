import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useClient } from "../contexts/ClientContext";
import { useNavigation } from "../contexts/NavigationContext";
import { formatTimestamp } from "../util/DateTimeUtil";
import { getLog } from "../util/Logger";
import type { DocDraft, DraftCounts } from "jolli-common";
import { Edit, Inbox as InboxIcon, Search, Share2, Sparkles, Trash2 } from "lucide-react";
import { type ReactElement, useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

interface InboxSection {
	title: string;
	drafts: Array<DocDraft>;
	count: number;
}

export function Inbox(): ReactElement {
	const content = useIntlayer("inbox");
	const dateTime = useIntlayer("date-time");
	const client = useClient();
	const { navigate } = useNavigation();

	const [loading, setLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState("");
	const [draftCounts, setDraftCounts] = useState<DraftCounts | null>(null);
	const [newDrafts, setNewDrafts] = useState<Array<DocDraft>>([]);
	const [sharedDrafts, setSharedDrafts] = useState<Array<DocDraft>>([]);
	const [suggestedUpdates, setSuggestedUpdates] = useState<Array<DocDraft>>([]);

	// Load inbox data
	useEffect(() => {
		loadInboxData();
	}, []);

	async function loadInboxData(): Promise<void> {
		setLoading(true);
		try {
			// Fetch draft counts
			const counts = await client.docDrafts().getDraftCounts();
			setDraftCounts(counts);

			// Fetch my new drafts
			const myDrafts = await client.docDrafts().listDocDraftsFiltered("my-new-drafts");
			setNewDrafts(myDrafts.drafts);

			// Fetch shared with me
			const shared = await client.docDrafts().listDocDraftsFiltered("shared-with-me");
			setSharedDrafts(shared.drafts);

			// Fetch suggested updates
			const suggested = await client.docDrafts().listDocDraftsFiltered("suggested-updates");
			setSuggestedUpdates(suggested.drafts);

			log.debug(
				{
					counts,
					myDraftsCount: myDrafts.drafts.length,
					sharedCount: shared.drafts.length,
					suggestedCount: suggested.drafts.length,
				},
				"Loaded inbox data",
			);
		} catch (error) {
			log.error(error, "Failed to load inbox data");
		} finally {
			setLoading(false);
		}
	}

	function handleEditDraft(draftId: number): void {
		navigate(`/article-draft/${draftId}`);
	}

	async function handleDeleteDraft(draft: DocDraft): Promise<void> {
		/* v8 ignore next 3 - browser API */
		if (!window.confirm(content.confirmDelete.value.replace("{{title}}", draft.title || "Untitled"))) {
			return;
		}

		try {
			await client.docDrafts().deleteDocDraft(draft.id);
			// Reload inbox data
			await loadInboxData();
		} catch (error) {
			log.error(error, "Failed to delete draft");
		}
	}

	// Filter drafts by search query
	function filterDrafts(drafts: Array<DocDraft>): Array<DocDraft> {
		if (!searchQuery.trim()) {
			return drafts;
		}
		const query = searchQuery.toLowerCase();
		return drafts.filter(draft => draft.title?.toLowerCase().includes(query));
	}

	const sections: Array<InboxSection> = [
		{
			title: content.sectionNewDrafts.value,
			drafts: filterDrafts(newDrafts),
			count: draftCounts?.myNewDrafts ?? 0,
		},
		{
			title: content.sectionSharedWithMe.value,
			drafts: filterDrafts(sharedDrafts),
			count: draftCounts?.sharedWithMe ?? 0,
		},
		{
			title: content.sectionSuggestedUpdates.value,
			drafts: filterDrafts(suggestedUpdates),
			count: draftCounts?.suggestedUpdates ?? 0,
		},
	];

	const totalItems = sections.reduce((sum, section) => sum + section.drafts.length, 0);

	if (loading) {
		return (
			<div className="h-full p-6">
				<div className="text-muted-foreground">{content.loading}</div>
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col">
			{/* Header */}
			<div className="border-b bg-background p-6">
				<div className="flex items-center gap-3 mb-4">
					<InboxIcon className="h-6 w-6 text-primary" />
					<div>
						<h1 className="text-2xl font-bold">{content.title}</h1>
						<p className="text-sm text-muted-foreground">{content.subtitle}</p>
					</div>
				</div>

				{/* Search */}
				<div className="relative">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder={content.searchPlaceholder.value}
						value={searchQuery}
						onChange={e => setSearchQuery(e.target.value)}
						className="pl-9"
						data-testid="inbox-search"
					/>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
				{totalItems === 0 && !searchQuery ? (
					<div className="flex flex-col items-center justify-center h-full text-center">
						<InboxIcon className="h-16 w-16 text-muted-foreground/30 mb-4" />
						<h3 className="text-lg font-medium mb-2">{content.noItems}</h3>
						<p className="text-sm text-muted-foreground max-w-md">{content.empty}</p>
					</div>
				) : totalItems === 0 && searchQuery ? (
					<div className="text-center text-muted-foreground py-12">{content.noItems}</div>
				) : (
					<div className="space-y-8">
						{sections.map(section => {
							if (section.drafts.length === 0) {
								return null;
							}

							return (
								<div key={section.title}>
									<div className="flex items-center gap-2 mb-4">
										<h2 className="text-lg font-semibold">{section.title}</h2>
										<Badge variant="secondary">{section.drafts.length}</Badge>
									</div>

									<div className="space-y-2">
										{section.drafts.map(draft => (
											<div
												key={draft.id}
												className="flex items-start justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
												data-testid={`inbox-item-${draft.id}`}
											>
												<div className="flex-1 min-w-0">
													<div className="flex items-center gap-2 mb-1">
														<h3 className="font-medium truncate">
															{draft.title || "Untitled"}
														</h3>
														{draft.createdByAgent && (
															<Badge
																variant="secondary"
																className="text-xs"
																data-testid={`draft-ai-badge-${draft.id}`}
															>
																<Sparkles className="h-3 w-3 mr-1" />
																{content.aiDraft}
															</Badge>
														)}
														{draft.isShared && (
															<Badge
																variant="secondary"
																className="text-xs"
																data-testid={`draft-shared-badge-${draft.id}`}
															>
																<Share2 className="h-3 w-3 mr-1" />
																{content.shared}
															</Badge>
														)}
														{draft.docId && (
															<Badge
																variant="secondary"
																className="text-xs"
																data-testid={`draft-editing-badge-${draft.id}`}
															>
																<Edit className="h-3 w-3 mr-1" />
																{content.editing}
															</Badge>
														)}
													</div>
													<div className="text-sm text-muted-foreground">
														{content.lastUpdated}{" "}
														{formatTimestamp(dateTime, draft.updatedAt)}
													</div>
												</div>

												<div className="flex items-center gap-2 ml-4">
													<Button
														variant="ghost"
														size="sm"
														onClick={() => handleEditDraft(draft.id)}
														data-testid={`edit-draft-${draft.id}`}
													>
														<Edit className="h-4 w-4 mr-1" />
														{content.editButton}
													</Button>
													<Button
														variant="ghost"
														size="sm"
														onClick={() => handleDeleteDraft(draft)}
														data-testid={`delete-draft-${draft.id}`}
													>
														<Trash2 className="h-4 w-4" />
													</Button>
												</div>
											</div>
										))}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}

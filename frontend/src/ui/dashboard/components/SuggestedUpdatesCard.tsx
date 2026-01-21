import { Button } from "../../../components/ui/Button";
import { useClient } from "../../../contexts/ClientContext";
import { useNavigation } from "../../../contexts/NavigationContext";
import { formatTimestamp } from "../../../util/DateTimeUtil";
import { DashboardCard } from "./DashboardCard";
import type { DocDraftWithPendingChanges } from "jolli-common";
import { FileEdit } from "lucide-react";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

/**
 * Dashboard card showing articles with pending section changes
 */
export function SuggestedUpdatesCard(): ReactElement | null {
	const content = useIntlayer("suggested-updates-card");
	const dateTime = useIntlayer("date-time");
	const client = useClient();
	const { navigate } = useNavigation();
	const [draftsWithChanges, setDraftsWithChanges] = useState<Array<DocDraftWithPendingChanges>>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const loadDraftsWithChanges = async () => {
			try {
				const data = await client.docDrafts().getDraftsWithPendingChanges();
				setDraftsWithChanges(data);
			} catch (err) {
				console.error("Failed to load drafts with pending changes:", err);
			} finally {
				setLoading(false);
			}
		};

		loadDraftsWithChanges().then();
	}, [client]);

	// Don't render if there are no drafts with pending changes
	if (!loading && draftsWithChanges.length === 0) {
		return null;
	}

	// Show only the 5 most recent
	const displayedDrafts = draftsWithChanges.slice(0, 5);
	const hasMore = draftsWithChanges.length > 5;

	const handleViewAll = () => {
		navigate("/articles/suggested-updates");
	};

	const handleDraftClick = (draftId: number) => {
		navigate(`/article-draft/${draftId}`);
	};

	return (
		<DashboardCard
			title={content.title.value}
			icon={FileEdit}
			{...(hasMore
				? {
						action: (
							<Button variant="ghost" size="sm" onClick={handleViewAll} data-testid="view-all-button">
								{content.viewAll}
							</Button>
						),
					}
				: {})}
		>
			{loading ? (
				<div className="text-center text-muted-foreground py-4">{content.loading}</div>
			) : (
				<div className="space-y-3">
					{displayedDrafts.map(({ draft, pendingChangesCount, lastChangeUpdatedAt }) => (
						<div
							key={draft.id}
							className="flex items-center justify-between p-3 rounded-md border bg-card hover:bg-accent cursor-pointer transition-colors"
							onClick={() => handleDraftClick(draft.id)}
							onKeyDown={e => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									handleDraftClick(draft.id);
								}
							}}
							role="button"
							tabIndex={0}
							data-testid={`draft-item-${draft.id}`}
						>
							<div className="flex-1 min-w-0">
								<div className="font-medium truncate">{draft.title}</div>
								<div className="text-sm text-muted-foreground">
									<span className="inline-flex items-center gap-1">
										<span className="font-semibold text-[rgb(180,120,0)]">
											{pendingChangesCount} {content.suggestions}
										</span>
										<span className="mx-1">•</span>
										<span>{formatTimestamp(dateTime, lastChangeUpdatedAt, "short")}</span>
									</span>
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</DashboardCard>
	);
}

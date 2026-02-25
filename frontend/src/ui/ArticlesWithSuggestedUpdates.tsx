import { Button } from "../components/ui/Button";
import { useClient } from "../contexts/ClientContext";
import { useNavigation } from "../contexts/NavigationContext";
import { formatTimestamp } from "../util/DateTimeUtil";
import type { DocDraftWithPendingChanges } from "jolli-common";
import { ArrowLeft, FileEdit } from "lucide-react";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

/**
 * Page showing all articles with pending section changes
 */
export function ArticlesWithSuggestedUpdates(): ReactElement {
	const content = useIntlayer("articles-suggested-updates");
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

	const handleBack = () => {
		navigate("/");
	};

	const handleDraftClick = (draftId: number) => {
		navigate(`/article-draft/${draftId}`);
	};

	return (
		<div className="bg-card rounded-lg p-6 border h-full overflow-auto scrollbar-thin">
			<div className="mb-6">
				<Button variant="ghost" size="sm" onClick={handleBack} className="mb-4">
					<ArrowLeft className="h-4 w-4 mr-2" />
					{content.back}
				</Button>
				<div className="flex items-center gap-3">
					<div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
						<FileEdit className="w-5 h-5 text-primary" />
					</div>
					<div>
						<h1 className="font-semibold" style={{ fontSize: "2rem", margin: 0 }}>
							{content.title}
						</h1>
						<p className="text-sm m-0" style={{ color: "#808080cc" }}>
							{content.subtitle}
						</p>
					</div>
				</div>
			</div>

			{loading ? (
				<div className="text-center text-muted-foreground py-8">{content.loading}</div>
			) : draftsWithChanges.length === 0 ? (
				<div className="text-center text-muted-foreground py-8">
					<FileEdit className="h-12 w-12 mx-auto mb-4 opacity-50" />
					<p>{content.noArticles}</p>
				</div>
			) : (
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{draftsWithChanges.map(({ draft, pendingChangesCount, lastChangeUpdatedAt }) => (
						<div
							key={draft.id}
							className="p-4 rounded-md border bg-card hover:bg-accent cursor-pointer transition-colors"
							onClick={() => handleDraftClick(draft.id)}
							onKeyDown={e => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									handleDraftClick(draft.id);
								}
							}}
							role="button"
							tabIndex={0}
							data-testid={`draft-card-${draft.id}`}
						>
							<div className="flex items-start gap-3">
								<div className="w-10 h-10 rounded-md bg-[rgba(255,180,0,0.1)] flex items-center justify-center flex-shrink-0">
									<FileEdit className="w-5 h-5 text-[rgb(180,120,0)]" />
								</div>
								<div className="flex-1 min-w-0">
									<div className="font-medium truncate mb-1">{draft.title}</div>
									<div className="text-sm text-muted-foreground space-y-1">
										<div>
											<span className="font-semibold text-[rgb(180,120,0)]">
												{pendingChangesCount} {content.suggestions}
											</span>
										</div>
										<div>{formatTimestamp(dateTime, lastChangeUpdatedAt, "short")}</div>
									</div>
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

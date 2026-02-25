import { cn } from "../../common/ClassNameUtils";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { getChangeCount, needsRebuild } from "./SiteDetailUtils";
import {
	ArticleChangeItem,
	AuthChangeItem,
	BrandingChangeItem,
	ConfigChangesItem,
	FolderStructureChangeItem,
} from "./SitePendingChangeItems";
import type { ChangedArticle, SiteWithUpdate } from "jolli-common";
import { CheckCircle, FileText, type LucideIcon, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { type ReactElement, type ReactNode, useMemo } from "react";
import { useIntlayer } from "react-intlayer";

export interface SitePendingChangesTabProps {
	site: SiteWithUpdate;
	rebuilding: boolean;
	hasUnsavedChanges: boolean;
	onRebuild: () => void;
}

interface GroupedArticles {
	new: Array<ChangedArticle>;
	updated: Array<ChangedArticle>;
	deleted: Array<ChangedArticle>;
}

function groupArticlesByChangeType(articles: Array<ChangedArticle> | undefined): GroupedArticles {
	const groups: GroupedArticles = { new: [], updated: [], deleted: [] };
	if (!articles) {
		return groups;
	}
	for (const article of articles) {
		if (article.changeType === "new") {
			groups.new.push(article);
		} else if (article.changeType === "updated") {
			groups.updated.push(article);
		} else if (article.changeType === "deleted") {
			groups.deleted.push(article);
		}
	}
	return groups;
}

function getReasonLabel(
	changeReason: ChangedArticle["changeReason"],
	content: ReturnType<typeof useIntlayer<"site-pending-changes-tab">>,
): string | undefined {
	if (changeReason === "content") {
		return content.reasonContent.value;
	}
	if (changeReason === "selection") {
		return content.reasonSelection.value;
	}
	if (changeReason === "config") {
		return content.reasonConfig.value;
	}
	return;
}

export function SitePendingChangesTab({
	site,
	rebuilding,
	hasUnsavedChanges,
	onRebuild,
}: SitePendingChangesTabProps): ReactElement {
	const content = useIntlayer("site-pending-changes-tab");

	const hasChanges = needsRebuild(site);
	const changeCount = getChangeCount(site);
	const isBuilding = site.status === "building" || site.status === "pending";

	const groupedArticles = useMemo(() => groupArticlesByChangeType(site.changedArticles), [site.changedArticles]);

	const badges = useMemo(
		() => ({
			new: content.changeNew,
			updated: content.changeUpdated,
			deleted: content.changeDeleted,
		}),
		[content.changeNew, content.changeUpdated, content.changeDeleted],
	);

	const articleGroupSections: Array<{
		articles: Array<ChangedArticle>;
		icon: LucideIcon;
		bgClass: string;
		textClass: string;
		label: ReactNode;
		key: string;
	}> = [
		{
			articles: groupedArticles.new,
			icon: Plus,
			bgClass: "bg-green-500/5",
			textClass: "text-green-600 dark:text-green-400",
			label: content.newArticles,
			key: "new",
		},
		{
			articles: groupedArticles.updated,
			icon: Pencil,
			bgClass: "bg-blue-500/5",
			textClass: "text-blue-600 dark:text-blue-400",
			label: content.updatedArticles,
			key: "updated",
		},
		{
			articles: groupedArticles.deleted,
			icon: Trash2,
			bgClass: "bg-red-500/5",
			textClass: "text-red-600 dark:text-red-400",
			label: content.deletedArticles,
			key: "deleted",
		},
	];

	if (!hasChanges && !isBuilding) {
		return (
			<div className="h-full flex flex-col items-center justify-center p-6">
				<div className="text-center max-w-md">
					<div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
						<CheckCircle className="h-8 w-8 text-green-500" />
					</div>
					<h2 className="text-lg font-semibold mb-2">{content.noChangesTitle}</h2>
					<p className="text-muted-foreground text-sm">{content.noChangesDescription}</p>
				</div>
			</div>
		);
	}

	if (isBuilding) {
		return (
			<div className="h-full flex flex-col items-center justify-center p-6">
				<div className="text-center max-w-md">
					<div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
						<RefreshCw className="h-8 w-8 text-blue-500 animate-spin" />
					</div>
					<h2 className="text-lg font-semibold mb-2">{content.buildingTitle}</h2>
					<p className="text-muted-foreground text-sm">{content.buildingDescription}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col p-6">
			<div className="mb-6">
				<h2 className="text-lg font-semibold mb-1">{content.title}</h2>
				<p className="text-sm text-muted-foreground">{content.description({ count: changeCount })}</p>
			</div>

			<div className="flex-1 overflow-y-auto scrollbar-thin space-y-4">
				{site.brandingChanged && (
					<BrandingChangeItem
						label={content.brandingChanges}
						description={content.brandingChangedDescription}
					/>
				)}

				{site.folderStructureChanged && (
					<FolderStructureChangeItem
						label={content.folderStructureChanges}
						description={content.folderStructureChangedDescription}
					/>
				)}

				{site.authChange && (
					<AuthChangeItem
						headerLabel={content.authChanges}
						fromEnabled={site.authChange.from}
						toEnabled={site.authChange.to}
						enabledLabel={content.authEnabled}
						disabledLabel={content.authDisabled}
					/>
				)}

				{site.changedConfigFiles && site.changedConfigFiles.length > 0 && (
					<ConfigChangesItem files={site.changedConfigFiles} headerLabel={content.configChanges} />
				)}

				{site.changedArticles && site.changedArticles.length > 0 && (
					<div className="border rounded-lg overflow-hidden">
						<div className="px-4 py-3 bg-muted/30 border-b">
							<div className="flex items-center gap-2">
								<FileText className="h-4 w-4 text-blue-500" />
								<span className="font-medium text-sm">{content.articleChanges}</span>
								<Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-xs">
									{site.changedArticles.length}
								</Badge>
							</div>
						</div>

						{articleGroupSections.map(
							({ articles, icon: Icon, bgClass, textClass, label, key }) =>
								articles.length > 0 && (
									<div key={key}>
										<div className={cn("px-4 py-2 border-b flex items-center gap-2", bgClass)}>
											<Icon className={cn("h-3.5 w-3.5", textClass)} />
											<span className={cn("text-xs font-medium", textClass)}>
												{label} ({articles.length})
											</span>
										</div>
										<div className="divide-y">
											{articles.map(article => (
												<ArticleChangeItem
													key={article.jrn}
													title={article.title}
													changeType={article.changeType}
													contentType={article.contentType}
													badges={badges}
													reasonLabel={getReasonLabel(article.changeReason, content)}
													docType={article.docType}
												/>
											))}
										</div>
									</div>
								),
						)}
					</div>
				)}
			</div>

			<div className="pt-6 border-t mt-6 flex flex-col items-end">
				<Button onClick={onRebuild} disabled={rebuilding || hasUnsavedChanges} data-testid="publish-button">
					<RefreshCw className={cn("h-4 w-4 mr-2", rebuilding && "animate-spin")} />
					{hasUnsavedChanges ? content.savingChanges : rebuilding ? content.publishing : content.publishNow}
				</Button>
				{hasUnsavedChanges && (
					<p className="text-xs text-muted-foreground text-center mt-2">{content.unsavedChangesNote}</p>
				)}
			</div>
		</div>
	);
}

import { Badge } from "../../components/ui/Badge";
import type { ArticleChangeType, DocsiteStatus, SiteWithUpdate } from "jolli-common";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

export function getChangeCount(site: SiteWithUpdate): number {
	let count = 0;
	if (site.changedArticles) {
		count += site.changedArticles.length;
	}
	if (site.changedConfigFiles) {
		count += site.changedConfigFiles.length;
	}
	if (site.authChange) {
		count += 1;
	}
	if (site.brandingChanged) {
		count += 1;
	}
	if (site.folderStructureChanged) {
		count += 1;
	}
	return count;
}

export function needsRebuild(site: SiteWithUpdate): boolean {
	return (
		site.needsUpdate ||
		!!site.authChange ||
		!!site.brandingChanged ||
		!!site.folderStructureChanged ||
		(site.changedConfigFiles !== undefined && site.changedConfigFiles.length > 0)
	);
}

export function getStatusBadge(
	status: DocsiteStatus,
	statusLabels: { active: ReactNode; building: ReactNode; pending: ReactNode; error: ReactNode },
): ReactElement | null {
	switch (status) {
		case "active":
			return (
				<Badge className="bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20">
					{statusLabels.active}
				</Badge>
			);
		case "building":
			return (
				<Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-500/20">
					{statusLabels.building}
				</Badge>
			);
		case "pending":
			return (
				<Badge className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/20">
					{statusLabels.pending}
				</Badge>
			);
		case "error":
			return (
				<Badge className="bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-500/20">
					{statusLabels.error}
				</Badge>
			);
		default:
			return null;
	}
}

interface ChangeTypeStyle {
	Icon: typeof Plus;
	bgClass: string;
	textClass: string;
	borderClass: string;
	badgeClass: string;
}

export function getChangeTypeStyle(changeType: ArticleChangeType | undefined): ChangeTypeStyle {
	switch (changeType) {
		case "new":
			return {
				Icon: Plus,
				bgClass: "bg-green-500/10",
				textClass: "text-green-600 dark:text-green-400",
				borderClass: "border-green-500/20",
				badgeClass: "bg-green-500/20 text-green-700 dark:text-green-400",
			};
		case "deleted":
			return {
				Icon: Trash2,
				bgClass: "bg-red-500/10",
				textClass: "text-red-600 dark:text-red-400",
				borderClass: "border-red-500/20",
				badgeClass: "bg-red-500/20 text-red-700 dark:text-red-400",
			};
		default:
			// Covers "updated" and undefined (backward compat)
			return {
				Icon: Pencil,
				bgClass: "bg-amber-500/10",
				textClass: "text-amber-600 dark:text-amber-400",
				borderClass: "border-amber-500/20",
				badgeClass: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
			};
	}
}

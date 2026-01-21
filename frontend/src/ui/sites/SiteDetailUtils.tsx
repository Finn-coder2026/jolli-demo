import { Badge } from "../../components/ui/Badge";
import type { ArticleChangeType } from "jolli-common";
import { Pencil, Plus, Trash2 } from "lucide-react";

/**
 * Returns a status badge component based on the site's build status.
 */
export function getStatusBadge(
	status: string,
	// biome-ignore lint/suspicious/noExplicitAny: Intlayer returns Proxy objects with unknown structure
	statusLabels: { active: any; building: any; pending: any; error: any },
) {
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

/**
 * Returns a visibility badge component based on the site's visibility setting.
 */
export function getVisibilityBadge(
	visibility: string,
	// biome-ignore lint/suspicious/noExplicitAny: Intlayer returns Proxy objects with unknown structure
	visibilityLabels: { internal: any; external: any },
) {
	switch (visibility) {
		case "external":
			return (
				<Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-500/20">
					{visibilityLabels.external}
				</Badge>
			);
		case "internal":
			return (
				<Badge className="bg-purple-500/10 text-purple-700 dark:text-purple-400 hover:bg-purple-500/20">
					{visibilityLabels.internal}
				</Badge>
			);
		default:
			return null;
	}
}

/**
 * Returns styling information for article change types (new, updated, deleted).
 */
export function getChangeTypeStyle(changeType: ArticleChangeType | undefined) {
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

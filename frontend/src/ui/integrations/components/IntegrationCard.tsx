import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { formatTimestamp } from "../../../util/DateTimeUtil";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, ChevronRight, Trash2 } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface IntegrationCardProps {
	title: string;
	icon: LucideIcon;
	orgCount?: number;
	totalRepos?: number;
	enabledRepos?: number;
	needsAttention?: number;
	lastSync?: string;
	onClick?: () => void;
	onDelete?: () => void;
}

export function IntegrationCard({
	title,
	icon: Icon,
	orgCount,
	totalRepos,
	enabledRepos,
	needsAttention,
	lastSync,
	onClick,
	onDelete,
}: IntegrationCardProps): ReactElement {
	const content = useIntlayer("integration-card");
	const dateTimeContent = useIntlayer("date-time");

	function handleDelete(e: React.MouseEvent) {
		e.stopPropagation();
		onDelete?.();
	}

	return (
		<div
			className="p-6 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
			onClick={onClick}
			onKeyDown={e => {
				if (e.key === "Enter" || e.key === " ") {
					onClick?.();
				}
			}}
			role="button"
			tabIndex={0}
		>
			<div className="flex items-start justify-between">
				<div className="flex items-start gap-4 flex-1">
					<div className="rounded-full bg-primary/10 p-3">
						<Icon className="h-6 w-6 text-primary" />
					</div>
					<div className="flex-1">
						<h3 className="font-semibold text-lg mb-2">{title}</h3>
						<div className="space-y-1 text-sm text-muted-foreground">
							{orgCount !== undefined && (
								<p>
									{
										content.organizationsCount({
											count: orgCount,
											organizations: content.organizations(orgCount).value,
										}).value
									}
								</p>
							)}
							{totalRepos !== undefined && enabledRepos !== undefined && (
								<p>
									{content.reposEnabledOutOf({
										enabled: enabledRepos,
										total: totalRepos,
										repositories: content.repositories(totalRepos).value,
									})}
								</p>
							)}
							{lastSync && (
								<p className="text-xs">
									{content.lastSynced({ date: formatTimestamp(dateTimeContent, lastSync, "short") })}
								</p>
							)}
						</div>
						{needsAttention !== undefined && needsAttention > 0 && (
							<div className="mt-3">
								<Badge variant="destructive" className="gap-1">
									<AlertCircle className="h-3 w-3" />
									{content.reposNeedAttentionCount({
										count: needsAttention,
										needAttention: content.reposNeedAttention(needsAttention).value,
									})}
								</Badge>
							</div>
						)}
					</div>
				</div>
				<div className="flex items-center gap-2 mt-1">
					{onDelete && (
						<Button
							variant="ghost"
							size="icon"
							className="h-8 w-8 text-muted-foreground hover:text-destructive"
							onClick={handleDelete}
							data-testid="delete-integration-button"
						>
							<Trash2 className="h-4 w-4" />
						</Button>
					)}
					{onClick && <ChevronRight className="h-5 w-5 text-muted-foreground" />}
				</div>
			</div>
		</div>
	);
}

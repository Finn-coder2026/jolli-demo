import { cn } from "../../common/ClassNameUtils";
import { Badge } from "../../components/ui/Badge";
import { getChangeTypeStyle } from "./SiteDetailUtils";
import type { ArticleChangeType, DocType } from "jolli-common";
import { FileJson, FileText, Folder, KeyRound, Palette, Pencil, Settings } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

interface BrandingChangeItemProps {
	label: ReactNode;
	description?: ReactNode;
	compact?: boolean;
}

export function BrandingChangeItem({ label, description, compact }: BrandingChangeItemProps): ReactElement {
	if (compact) {
		return (
			<div className="px-4 py-2 border-b">
				<div className="flex items-center gap-2 text-sm">
					<Palette className="h-4 w-4 text-amber-500" />
					<span className="font-medium">{label}</span>
				</div>
			</div>
		);
	}

	return (
		<div className="border rounded-lg overflow-hidden">
			<div className="px-4 py-3 bg-muted/30 border-b">
				<div className="flex items-center gap-2">
					<Palette className="h-4 w-4 text-amber-500" />
					<span className="font-medium text-sm">{label}</span>
				</div>
			</div>
			{description && (
				<div className="px-4 py-3">
					<p className="text-sm text-muted-foreground">{description}</p>
				</div>
			)}
		</div>
	);
}

interface FolderStructureChangeItemProps {
	label: ReactNode;
	description?: ReactNode;
	compact?: boolean;
}

export function FolderStructureChangeItem({
	label,
	description,
	compact,
}: FolderStructureChangeItemProps): ReactElement {
	if (compact) {
		return (
			<div className="px-4 py-2 border-b">
				<div className="flex items-center gap-2 text-sm">
					<Folder className="h-4 w-4 text-amber-500" />
					<span className="font-medium">{label}</span>
				</div>
			</div>
		);
	}

	return (
		<div className="border rounded-lg overflow-hidden">
			<div className="px-4 py-3 bg-muted/30 border-b">
				<div className="flex items-center gap-2">
					<Folder className="h-4 w-4 text-amber-500" />
					<span className="font-medium text-sm">{label}</span>
				</div>
			</div>
			{description && (
				<div className="px-4 py-3">
					<p className="text-sm text-muted-foreground">{description}</p>
				</div>
			)}
		</div>
	);
}

interface AuthChangeItemProps {
	fromEnabled: boolean;
	toEnabled: boolean;
	enabledLabel: ReactNode;
	disabledLabel: ReactNode;
	headerLabel: ReactNode;
	compact?: boolean;
}

export function AuthChangeItem({
	fromEnabled,
	toEnabled,
	enabledLabel,
	disabledLabel,
	headerLabel,
	compact,
}: AuthChangeItemProps): ReactElement {
	const fromLabel = fromEnabled ? enabledLabel : disabledLabel;
	const toLabel = toEnabled ? enabledLabel : disabledLabel;

	if (compact) {
		return (
			<div className="px-4 py-2 border-b">
				<div className="flex items-center gap-2 text-sm">
					<KeyRound className="h-4 w-4 text-amber-500" />
					<span className="font-medium">{headerLabel}</span>
					<span className="text-muted-foreground">
						{fromLabel} → {toLabel}
					</span>
				</div>
			</div>
		);
	}

	return (
		<div className="border rounded-lg overflow-hidden">
			<div className="px-4 py-3 bg-muted/30 border-b">
				<div className="flex items-center gap-2">
					<KeyRound className="h-4 w-4 text-amber-500" />
					<span className="font-medium text-sm">{headerLabel}</span>
				</div>
			</div>
			<div className="px-4 py-3">
				<p className="text-sm text-muted-foreground">
					{fromLabel} → {toLabel}
				</p>
			</div>
		</div>
	);
}

interface ConfigFileEntry {
	path: string;
	displayName: string;
}

interface ConfigChangesItemProps {
	files: Array<ConfigFileEntry>;
	headerLabel: ReactNode;
	compact?: boolean;
}

export function ConfigChangesItem({ files, headerLabel, compact }: ConfigChangesItemProps): ReactElement {
	if (compact) {
		return (
			<div className="px-4 py-2 border-b">
				<div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
					{headerLabel} ({files.length})
				</div>
				<div className="space-y-1">
					{files.map(file => (
						<div key={file.path} className="flex items-center gap-2 text-sm">
							<Settings className="h-3.5 w-3.5 text-purple-500" />
							<Pencil className="h-3 w-3 text-purple-500" />
							<span className="truncate flex-1">{file.displayName}</span>
						</div>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="border rounded-lg overflow-hidden">
			<div className="px-4 py-3 bg-muted/30 border-b">
				<div className="flex items-center gap-2">
					<Settings className="h-4 w-4 text-purple-500" />
					<span className="font-medium text-sm">{headerLabel}</span>
					<Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-xs">
						{files.length}
					</Badge>
				</div>
			</div>
			<div className="divide-y">
				{files.map(file => (
					<div key={file.path} className="px-4 py-2.5 flex items-center gap-2">
						<Settings className="h-4 w-4 text-purple-500/70" />
						<Pencil className="h-3 w-3 text-purple-500/70" />
						<span className="text-sm flex-1">{file.displayName}</span>
					</div>
				))}
			</div>
		</div>
	);
}

interface ArticleChangeItemProps {
	title: string;
	changeType: ArticleChangeType;
	contentType: string;
	badges: { new: ReactNode; updated: ReactNode; deleted: ReactNode };
	compact?: boolean;
	reasonLabel?: string | undefined;
	/** Whether this item is a document or folder (affects icon display) */
	docType?: DocType | undefined;
}

function isJsonOrYamlContent(contentType: string): boolean {
	return contentType === "application/json" || contentType === "application/yaml";
}

function selectBadgeLabel(changeType: ArticleChangeType, badges: ArticleChangeItemProps["badges"]): ReactNode {
	if (changeType === "new") {
		return badges.new;
	}
	if (changeType === "updated") {
		return badges.updated;
	}
	return badges.deleted;
}

export function ArticleChangeItem({
	title,
	changeType,
	contentType,
	badges,
	compact,
	reasonLabel,
	docType,
}: ArticleChangeItemProps): ReactElement {
	const style = getChangeTypeStyle(changeType);
	const IconComponent = docType === "folder" ? Folder : isJsonOrYamlContent(contentType) ? FileJson : FileText;
	const badgeLabel = selectBadgeLabel(changeType, badges);

	if (compact) {
		return (
			<div className="flex items-center gap-2 text-sm">
				<IconComponent className={cn("h-3.5 w-3.5", style.textClass)} />
				<span className="truncate flex-1">{title}</span>
				<Badge className={cn("text-xs", style.badgeClass)}>{badgeLabel}</Badge>
			</div>
		);
	}

	return (
		<div className="px-4 py-2.5 flex items-start gap-3 hover:bg-muted/20 transition-colors">
			<div className="flex-shrink-0 mt-0.5">
				<IconComponent className={cn("h-4 w-4", style.textClass)} />
			</div>

			<div className="flex-1 min-w-0">
				<div className="text-sm font-medium truncate">{title}</div>
				{reasonLabel && (
					<div className="mt-0.5">
						<span className="text-xs text-muted-foreground">{reasonLabel}</span>
					</div>
				)}
			</div>

			<Badge className={cn("text-xs flex-shrink-0", style.badgeClass)}>{badgeLabel}</Badge>
		</div>
	);
}

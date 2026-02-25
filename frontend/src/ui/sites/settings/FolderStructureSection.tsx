import { SectionHeader } from "../SectionHeader";
import type { SiteWithUpdate } from "jolli-common";
import { Check, FolderTree, Info } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

interface FolderStructureSectionProps {
	docsite: SiteWithUpdate;
	saving: boolean;
	onToggle: () => Promise<void>;
}

export function FolderStructureSection({ docsite, saving, onToggle }: FolderStructureSectionProps): ReactElement {
	const content = useIntlayer("site-settings-tab");

	const useFolderStructure = docsite.metadata?.useSpaceFolderStructure ?? false;

	return (
		<section className="space-y-4" data-testid="folder-structure-section">
			<SectionHeader
				icon={FolderTree}
				title={content.folderStructureTitle}
				description={content.folderStructureDescription}
				trailing={
					saving && (
						<span className="text-xs text-muted-foreground animate-pulse ml-auto">{content.saving}</span>
					)
				}
			/>

			<button
				type="button"
				onClick={onToggle}
				disabled={saving || docsite.status !== "active"}
				className={`w-full text-left p-4 rounded-lg border-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
					useFolderStructure
						? "border-primary bg-primary/5"
						: "border-border hover:border-muted-foreground/50"
				}`}
				data-testid="folder-structure-toggle"
			>
				<div className="flex items-start gap-3">
					<div
						className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
							useFolderStructure ? "border-primary bg-primary" : "border-muted-foreground/50"
						}`}
					>
						{useFolderStructure && <Check className="h-3 w-3 text-primary-foreground" />}
					</div>
					<div className="flex-1">
						<span className="font-medium">{content.useSpaceFolderStructureLabel}</span>
						<p className="text-sm text-muted-foreground mt-1">
							{content.useSpaceFolderStructureDescription}
						</p>
					</div>
				</div>
			</button>

			<div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
				<Info className="h-3.5 w-3.5 flex-shrink-0" />
				<span>{content.folderStructureRebuildNote}</span>
			</div>
		</section>
	);
}

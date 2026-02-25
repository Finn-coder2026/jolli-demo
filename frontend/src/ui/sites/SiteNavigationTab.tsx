import { RepositoryViewer } from "./RepositoryViewer";
import { SectionHeader } from "./SectionHeader";
import type { SiteWithUpdate } from "jolli-common";
import { FolderTree, Info, ListTree } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

interface SiteNavigationTabProps {
	docsite: SiteWithUpdate;
	/** Callback when a repository file is saved */
	onFileSave?: () => void;
	/** Callback when repository dirty state changes */
	onDirtyStateChange?: (isDirty: boolean) => void;
}

/**
 * Site Navigation Tab - Manages the site's sidebar navigation structure.
 * Shows repository content files for editing the documentation sidebar menu.
 * When useSpaceFolderStructure is enabled, shows a read-only info banner instead.
 */
export function SiteNavigationTab({ docsite, onFileSave, onDirtyStateChange }: SiteNavigationTabProps): ReactElement {
	const content = useIntlayer("site-navigation-tab");

	// Check if we have a GitHub repo for navigation editing
	const hasGitHubRepo = Boolean(docsite.metadata?.githubRepo && docsite.metadata?.githubUrl);
	const useFolderStructure = docsite.metadata?.useSpaceFolderStructure ?? false;

	return (
		<div className="h-full flex flex-col" data-testid="navigation-tab">
			<div className="px-6 pt-6 pb-4" data-testid="navigation-header">
				<SectionHeader icon={ListTree} title={content.title} description={content.description} />
			</div>

			{/* Info banner when using space folder structure */}
			{useFolderStructure && (
				<div
					className="mx-6 mb-4 flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800"
					data-testid="folder-structure-banner"
				>
					<Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
					<span className="text-xs text-blue-700 dark:text-blue-300">{content.folderStructureBanner}</span>
				</div>
			)}

			<div className="flex-1 px-6 pb-6 min-h-0">
				{hasGitHubRepo ? (
					<RepositoryViewer
						docsite={docsite}
						onFileSave={useFolderStructure ? undefined : onFileSave}
						onDirtyStateChange={useFolderStructure ? undefined : onDirtyStateChange}
						showBranchInfo={false}
						contentFolderOnly={true}
						fullHeight={true}
						readOnly={useFolderStructure}
					/>
				) : (
					<div
						className="h-full flex items-center justify-center border rounded-lg bg-muted/10"
						data-testid="navigation-empty-state"
					>
						<div className="text-center">
							<FolderTree className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
							<p className="text-sm text-muted-foreground">{content.noNavigationFile}</p>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

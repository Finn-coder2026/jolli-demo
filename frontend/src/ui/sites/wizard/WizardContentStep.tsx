import { ArticlePicker } from "../ArticlePicker";
import type { Doc, Space } from "jolli-common";
import { Check, FileText, FolderTree, Loader2 } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

export interface ContentStepContent {
	contentTitle: ReactNode;
	contentDescription: ReactNode;
	loadingArticles: ReactNode;
	noArticlesAvailable: ReactNode;
	useSpaceFolderStructure: ReactNode;
	useSpaceFolderStructureDescription: ReactNode;
}

export interface WizardContentStepProps {
	articles: Array<Doc>;
	spaces: Array<Space>;
	loadingArticles: boolean;
	selectedArticleJrns: Set<string>;
	includeAllArticles: boolean;
	useSpaceFolderStructure: boolean;
	creating: boolean;
	content: ContentStepContent;
	onSelectionChange: (jrns: Set<string>) => void;
	onIncludeAllChange: (includeAll: boolean) => void;
	onToggleFolderStructure: () => void;
}

export function WizardContentStep({
	articles,
	spaces,
	loadingArticles,
	selectedArticleJrns,
	includeAllArticles,
	useSpaceFolderStructure,
	creating,
	content,
	onSelectionChange,
	onIncludeAllChange,
	onToggleFolderStructure,
}: WizardContentStepProps): ReactElement {
	return (
		<div className="space-y-6 max-w-2xl">
			<div>
				<h2 className="text-lg font-semibold mb-1">{content.contentTitle}</h2>
				<p className="text-sm text-muted-foreground">{content.contentDescription}</p>
			</div>

			{loadingArticles ? (
				<div className="py-12 text-center text-muted-foreground">
					<Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
					{content.loadingArticles}
				</div>
			) : articles.length === 0 ? (
				<div className="py-12 text-center">
					<FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
					<p className="text-amber-600 dark:text-amber-400">{content.noArticlesAvailable}</p>
				</div>
			) : (
				<ArticlePicker
					articles={articles}
					selectedJrns={selectedArticleJrns}
					onSelectionChange={onSelectionChange}
					includeAll={includeAllArticles}
					onIncludeAllChange={onIncludeAllChange}
					disabled={creating}
					spaces={spaces}
				/>
			)}

			<button
				type="button"
				onClick={onToggleFolderStructure}
				disabled={creating}
				className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors text-left ${
					useSpaceFolderStructure ? "bg-primary/5 border-primary/20" : "hover:bg-muted/50"
				}`}
				data-testid="folder-structure-toggle"
			>
				<div
					className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
						useSpaceFolderStructure ? "bg-primary border-primary" : "border-muted-foreground/30"
					}`}
				>
					{useSpaceFolderStructure && <Check className="h-3 w-3 text-primary-foreground" />}
				</div>
				<FolderTree className="h-4 w-4 text-muted-foreground/70 flex-shrink-0" />
				<div className="flex-1">
					<span className="text-sm font-medium">{content.useSpaceFolderStructure}</span>
					<p className="text-xs text-muted-foreground mt-0.5">{content.useSpaceFolderStructureDescription}</p>
				</div>
			</button>
		</div>
	);
}

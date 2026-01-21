import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { SelectBox } from "../../components/ui/SelectBox";
import type { DocDraftContentType } from "jolli-common";
import { X } from "lucide-react";
import type React from "react";
import { type ReactElement, useState } from "react";
import { useIntlayer } from "react-intlayer";

export interface NewArticleTitleDialogProps {
	onCreateWithTitle: (title: string, contentType: DocDraftContentType) => void;
	onClose: () => void;
}

// Helper function to stop event propagation (exported for testing)
export function handleStopPropagation(e: React.MouseEvent): void {
	e.stopPropagation();
}

export function NewArticleTitleDialog({ onCreateWithTitle, onClose }: NewArticleTitleDialogProps): ReactElement {
	const content = useIntlayer("new-article-title-dialog");
	const [title, setTitle] = useState("");
	const [contentType, setContentType] = useState<DocDraftContentType>("text/markdown");

	function handleCreate(): void {
		const trimmedTitle = title.trim();
		if (trimmedTitle) {
			onCreateWithTitle(trimmedTitle, contentType);
		}
	}

	function handleKeyDown(e: React.KeyboardEvent): void {
		if (e.key === "Enter") {
			e.preventDefault();
			handleCreate();
		} else if (e.key === "Escape") {
			onClose();
		}
	}

	const typeOptions = [
		{ value: "text/markdown", label: content.typeMarkdown.value },
		{ value: "application/json", label: content.typeJson.value },
		{ value: "application/yaml", label: content.typeYaml.value },
	];

	return (
		<div
			className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
			onClick={onClose}
			data-testid="new-article-title-dialog-backdrop"
		>
			<div
				className="bg-background border border-border rounded-lg p-6 max-w-md w-full m-4"
				onClick={handleStopPropagation}
				data-testid="new-article-title-dialog-content"
			>
				<div className="flex justify-between items-center mb-4">
					<h2 className="text-xl font-semibold">{content.title}</h2>
					<Button variant="ghost" size="icon" onClick={onClose} data-testid="close-dialog-button">
						<X className="h-5 w-5" />
					</Button>
				</div>

				<p className="text-sm text-muted-foreground mb-4">{content.subtitle}</p>

				<Input
					type="text"
					placeholder={content.titlePlaceholder.value}
					value={title}
					onChange={e => setTitle(e.target.value)}
					onKeyDown={handleKeyDown}
					className="mb-4"
					autoFocus
					data-testid="title-input"
				/>

				<div className="mb-4">
					<label className="block text-sm font-medium mb-2">{content.typeLabel}</label>
					<SelectBox
						value={contentType}
						onValueChange={value => setContentType(value as DocDraftContentType)}
						options={typeOptions}
						width="100%"
						data-testid="content-type-select"
					/>
					<p className="text-xs text-muted-foreground mt-1">{content.typeDescription}</p>
				</div>

				<div className="flex gap-3 justify-end">
					<Button variant="outline" onClick={onClose} data-testid="cancel-button">
						{content.cancel}
					</Button>
					<Button onClick={handleCreate} disabled={!title.trim()} data-testid="create-button">
						{content.create}
					</Button>
				</div>
			</div>
		</div>
	);
}

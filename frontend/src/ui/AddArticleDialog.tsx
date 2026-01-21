import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Textarea } from "../components/ui/Textarea";
import { X } from "lucide-react";
import type { ReactElement } from "react";
import { useState } from "react";

export interface AddArticleDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onSave: (data: { jrn: string; title: string; content: string }) => Promise<void>;
}

export function AddArticleDialog({ isOpen, onClose, onSave }: AddArticleDialogProps): ReactElement | null {
	const [jrn, setJrn] = useState("");
	const [title, setTitle] = useState("");
	const [content, setContent] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (!isOpen) {
		return null;
	}

	async function handleSave() {
		setError(null);

		// Validation
		if (!jrn.trim()) {
			setError("JRN is required");
			return;
		}
		if (!title.trim()) {
			setError("Title is required");
			return;
		}
		if (!content.trim()) {
			setError("Content is required");
			return;
		}

		try {
			setIsSaving(true);
			await onSave({
				jrn: jrn.trim(),
				title: title.trim(),
				content: content.trim(),
			});
			// Reset form and close
			setJrn("");
			setTitle("");
			setContent("");
			setError(null);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save article");
		} finally {
			setIsSaving(false);
		}
	}

	function handleClose() {
		if (!isSaving) {
			setJrn("");
			setTitle("");
			setContent("");
			setError(null);
			onClose();
		}
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			onClick={e => {
				if (e.target === e.currentTarget) {
					handleClose();
				}
			}}
		>
			<div className="bg-card rounded-lg border shadow-lg w-full max-w-3xl max-h-[90vh] flex flex-col">
				{/* Header */}
				<div className="flex items-center justify-between p-6 border-b">
					<h2 className="text-xl font-semibold">Add Article</h2>
					<button
						type="button"
						onClick={handleClose}
						disabled={isSaving}
						className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
					>
						<X className="h-5 w-5" />
					</button>
				</div>

				{/* Content */}
				<div className="p-6 overflow-y-auto flex-1">
					<div className="space-y-4">
						{/* JRN Input */}
						<div>
							<label htmlFor="article-jrn" className="block text-sm font-medium mb-2">
								JRN <span className="text-red-500">*</span>
							</label>
							<Input
								id="article-jrn"
								type="text"
								placeholder="/home/space-1/my-article.md"
								value={jrn}
								onChange={e => setJrn(e.target.value)}
								disabled={isSaving}
								className="font-mono"
							/>
							<p className="text-xs text-muted-foreground mt-1">
								Unique identifier for the article (e.g., /home/space-1/my-article.md)
							</p>
						</div>

						{/* Title Input */}
						<div>
							<label htmlFor="article-title" className="block text-sm font-medium mb-2">
								Title <span className="text-red-500">*</span>
							</label>
							<Input
								id="article-title"
								type="text"
								placeholder="My Article Title"
								value={title}
								onChange={e => setTitle(e.target.value)}
								disabled={isSaving}
							/>
						</div>

						{/* Content Textarea */}
						<div>
							<label htmlFor="article-content" className="block text-sm font-medium mb-2">
								Content (Markdown) <span className="text-red-500">*</span>
							</label>
							<Textarea
								id="article-content"
								placeholder="# My Article&#10;&#10;Write your markdown content here..."
								value={content}
								onChange={e => setContent(e.target.value)}
								disabled={isSaving}
								rows={15}
								className="font-mono"
							/>
							<p className="text-xs text-muted-foreground mt-1">You can use standard Markdown syntax</p>
						</div>

						{/* Error Message */}
						{error && (
							<div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-800 dark:text-red-200">
								{error}
							</div>
						)}
					</div>
				</div>

				{/* Footer */}
				<div className="flex items-center justify-end gap-3 p-6 border-t">
					<Button variant="outline" onClick={handleClose} disabled={isSaving}>
						Close
					</Button>
					<Button onClick={handleSave} disabled={isSaving}>
						{isSaving ? "Saving..." : "Save"}
					</Button>
				</div>
			</div>
		</div>
	);
}

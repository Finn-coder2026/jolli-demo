import { useClient } from "../../contexts/ClientContext";
import { FileEdit } from "lucide-react";
import type { ReactElement } from "react";
import { useState } from "react";
import { useIntlayer } from "react-intlayer";

export function DraftGenerator(): ReactElement {
	const content = useIntlayer("devtools");
	const client = useClient();
	const [docJrn, setDocJrn] = useState("");
	const [numEdits, setNumEdits] = useState(2);
	const [generating, setGenerating] = useState(false);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);
	const [generatedDraftId, setGeneratedDraftId] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);

	async function handleGenerate(): Promise<void> {
		setError(null);
		setSuccessMessage(null);
		setGeneratedDraftId(null);

		// Validate input
		if (!docJrn.trim()) {
			setError(content.draftGenerator.docJrnRequired.value);
			return;
		}

		setGenerating(true);

		try {
			const result = await client.devTools().generateDraftWithEdits({
				docJrn: docJrn.trim(),
				numEdits,
			});
			setSuccessMessage(result.message);
			setGeneratedDraftId(result.draftId);
			// Reset form
			setDocJrn("");
			setNumEdits(2);
		} catch (err) {
			setError(err instanceof Error ? err.message : content.draftGenerator.failedToGenerate.value);
		} finally {
			setGenerating(false);
		}
	}

	return (
		<div className="bg-card rounded-lg p-6 border">
			<div className="mb-4">
				<h2 className="font-semibold text-lg mb-1">{content.draftGenerator.title}</h2>
				<p className="text-sm text-muted-foreground">{content.draftGenerator.subtitle}</p>
			</div>

			{error ? (
				<div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-800 dark:text-red-200">
					{error}
				</div>
			) : null}

			{successMessage ? (
				<div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-sm text-green-800 dark:text-green-200">
					{successMessage}
					{generatedDraftId ? (
						<>
							{" "}
							<a
								href={`/article-draft/${generatedDraftId}`}
								className="underline font-medium hover:opacity-80"
							>
								{content.draftGenerator.viewDraft.value}
							</a>
						</>
					) : null}
				</div>
			) : null}

			<div className="space-y-4">
				{/* Article JRN input */}
				<div>
					<label htmlFor="docJrn" className="block text-sm font-medium mb-2">
						{content.draftGenerator.docJrnLabel.value}
					</label>
					<input
						id="docJrn"
						type="text"
						value={docJrn}
						onChange={e => setDocJrn(e.target.value)}
						placeholder={content.draftGenerator.docJrnPlaceholder.value}
						className="w-full px-3 py-2 border rounded-md bg-background text-foreground text-sm"
						disabled={generating}
					/>
				</div>

				{/* Number of edits */}
				<div>
					<label htmlFor="numEdits" className="block text-sm font-medium mb-2">
						{content.draftGenerator.numEditsLabel.value}
					</label>
					<input
						id="numEdits"
						type="number"
						value={numEdits}
						onChange={e => setNumEdits(Number.parseInt(e.target.value, 10))}
						className="w-full px-3 py-2 border rounded-md bg-background text-foreground text-sm"
						disabled={generating}
						min="1"
						max="5"
					/>
					<p className="text-xs text-muted-foreground mt-1">{content.draftGenerator.numEditsDesc.value}</p>
				</div>

				{/* Generate button */}
				<button
					type="button"
					onClick={handleGenerate}
					disabled={generating}
					className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
				>
					<FileEdit className="w-4 h-4" />
					{generating ? content.draftGenerator.generating : content.draftGenerator.generate}
				</button>
			</div>

			<div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-800 dark:text-blue-200">
				<strong>{content.draftGenerator.tipLabel}</strong> {content.draftGenerator.tipMessage}
			</div>
		</div>
	);
}

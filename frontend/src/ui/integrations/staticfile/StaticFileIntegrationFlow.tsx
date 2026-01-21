import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { useClient } from "../../../contexts/ClientContext";
import type { BaseIntegrationFlowProps } from "../types";
import { FileUp, Loader2 } from "lucide-react";
import type { DragEvent, KeyboardEvent, ReactElement } from "react";
import { useCallback, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

/* c8 ignore start */
export function StaticFileIntegrationFlow({ onComplete, onCancel }: BaseIntegrationFlowProps): ReactElement {
	const content = useIntlayer("static-file-integration-flow");
	const client = useClient();
	const [error, setError] = useState<string | undefined>();
	const [isLoading, setIsLoading] = useState(false);
	const [integrationName, setIntegrationName] = useState("");
	const [step, setStep] = useState<"name" | "upload" | "success">("name");
	const [integrationId, setIntegrationId] = useState<number | null>(null);
	const [isDragOver, setIsDragOver] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleCreateIntegration = useCallback(async () => {
		if (!integrationName.trim()) {
			setError(content.nameRequired.value);
			return;
		}

		setIsLoading(true);
		setError(undefined);

		try {
			const integration = await client.integrations().createIntegration({
				type: "static_file",
				name: integrationName.trim(),
				status: "active",
				metadata: { fileCount: 0 },
			});

			setIntegrationId(integration.id);
			setStep("upload");
		} catch (err) {
			setError(err instanceof Error ? err.message : content.failedCreate.value);
		} finally {
			setIsLoading(false);
		}
	}, [client, integrationName, content]);

	const uploadFile = useCallback(
		async (file: File) => {
			if (!integrationId) {
				setError(content.fileRequired.value);
				return;
			}

			setIsLoading(true);
			setError(undefined);

			try {
				const fileContent = await file.text();
				await client.integrations().uploadFile(integrationId, {
					filename: file.name,
					content: fileContent,
					contentType: getContentType(file.name),
				});

				setStep("success");
			} catch (err) {
				setError(err instanceof Error ? err.message : content.failedUpload.value);
			} finally {
				setIsLoading(false);
			}
		},
		[client, integrationId, content],
	);

	const handleFileSelect = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			if (file) {
				setError(undefined);
				uploadFile(file);
			}
		},
		[uploadFile],
	);

	function handleDragOver(event: DragEvent<HTMLDivElement>) {
		event.preventDefault();
		event.stopPropagation();
		setIsDragOver(true);
	}

	function handleDragLeave(event: DragEvent<HTMLDivElement>) {
		event.preventDefault();
		event.stopPropagation();
		setIsDragOver(false);
	}

	const handleDrop = useCallback(
		(event: DragEvent<HTMLDivElement>) => {
			event.preventDefault();
			event.stopPropagation();
			setIsDragOver(false);

			const file = event.dataTransfer.files?.[0];
			if (file) {
				setError(undefined);
				uploadFile(file);
			}
		},
		[uploadFile],
	);

	const handleSkipUpload = useCallback(() => {
		setStep("success");
	}, []);

	if (step === "success") {
		return (
			<div className="flex flex-col items-center justify-center min-h-[400px] text-center">
				<div className="text-4xl mb-4">✓</div>
				<h2 className="text-xl font-semibold mb-2">{content.successTitle}</h2>
				<p className="text-muted-foreground mb-6">{content.successMessage}</p>
				<Button onClick={() => onComplete()}>{content.done}</Button>
			</div>
		);
	}

	if (step === "upload") {
		return (
			<div className="flex flex-col items-center justify-center min-h-[400px]">
				<h2 className="text-xl font-semibold mb-2">{content.uploadTitle}</h2>
				<p className="text-muted-foreground mb-6">{content.uploadDescription}</p>

				<div className="w-full max-w-md space-y-4">
					<div
						className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
							isDragOver
								? "border-primary bg-primary/5"
								: "border-muted-foreground/25 hover:border-primary/50"
						}`}
						onClick={() => !isLoading && fileInputRef.current?.click()}
						onKeyDown={(e: KeyboardEvent<HTMLDivElement>) =>
							e.key === "Enter" && !isLoading && fileInputRef.current?.click()
						}
						onDragOver={handleDragOver}
						onDragLeave={handleDragLeave}
						onDrop={handleDrop}
						role="button"
						tabIndex={0}
					>
						{isLoading ? (
							<>
								<Loader2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-spin" />
								<p className="text-sm text-muted-foreground">{content.uploading}</p>
							</>
						) : (
							<>
								<FileUp className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
								<p className="text-sm text-muted-foreground">{content.dropzoneText}</p>
							</>
						)}
						<input
							ref={fileInputRef}
							type="file"
							className="hidden"
							accept=".md,.mdx,.txt,.json,.yaml,.yml"
							onChange={handleFileSelect}
							disabled={isLoading}
						/>
					</div>

					{error && <p className="text-destructive text-sm">{error}</p>}

					<Button variant="outline" onClick={handleSkipUpload} disabled={isLoading} className="w-full">
						{content.skipForNow}
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center min-h-[400px]">
			<h2 className="text-xl font-semibold mb-2">{content.title}</h2>
			<p className="text-muted-foreground mb-6">{content.description}</p>

			<div className="w-full max-w-md space-y-4">
				<div className="space-y-2">
					<label htmlFor="integration-name" className="text-sm font-medium leading-none">
						{content.nameLabel}
					</label>
					<Input
						id="integration-name"
						placeholder={content.namePlaceholder.value}
						value={integrationName}
						onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIntegrationName(e.target.value)}
						onKeyDown={(e: KeyboardEvent<HTMLInputElement>) =>
							e.key === "Enter" && handleCreateIntegration()
						}
					/>
				</div>

				{error && <p className="text-destructive text-sm">{error}</p>}

				<div className="flex gap-2">
					{onCancel && (
						<Button variant="outline" onClick={onCancel}>
							{content.cancel}
						</Button>
					)}
					<Button onClick={handleCreateIntegration} disabled={isLoading} className="flex-1">
						{isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
						{content.continue}
					</Button>
				</div>
			</div>
		</div>
	);
}

function getContentType(filename: string): string {
	const ext = filename.toLowerCase().split(".").pop();
	switch (ext) {
		case "md":
		case "mdx":
			return "text/markdown";
		case "json":
			return "application/json";
		case "yaml":
		case "yml":
			return "text/yaml";
		default:
			return "text/plain";
	}
}
/* c8 ignore stop */

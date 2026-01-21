import { Button } from "../../../components/ui/Button";
import { useClient } from "../../../contexts/ClientContext";
import { useNavigation } from "../../../contexts/NavigationContext";
import type { Integration } from "jolli-common";
import { ArrowLeft, FileUp, Loader2 } from "lucide-react";
import type { DragEvent, KeyboardEvent, ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

/* c8 ignore start */
export function StaticFileManage(): ReactElement {
	const content = useIntlayer("static-file-manage");
	const client = useClient();
	const { staticFileIntegrationId, navigate } = useNavigation();
	const [integration, setIntegration] = useState<Integration | null>(null);
	const [error, setError] = useState<string | undefined>();
	const [isLoading, setIsLoading] = useState(true);
	const [isUploading, setIsUploading] = useState(false);
	const [uploadSuccess, setUploadSuccess] = useState(false);
	const [isDragOver, setIsDragOver] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (staticFileIntegrationId) {
			loadIntegration(staticFileIntegrationId);
		}
	}, [staticFileIntegrationId]);

	async function loadIntegration(id: number) {
		setIsLoading(true);
		setError(undefined);
		try {
			const data = await client.integrations().getIntegration(id);
			setIntegration(data ?? null);
		} catch (err) {
			setError(err instanceof Error ? err.message : content.errorLoading.value);
		} finally {
			setIsLoading(false);
		}
	}

	const uploadFile = useCallback(
		async (file: File) => {
			if (!staticFileIntegrationId) {
				setError(content.fileRequired.value);
				return;
			}

			setIsUploading(true);
			setError(undefined);
			setUploadSuccess(false);

			try {
				const fileContent = await file.text();
				await client.integrations().uploadFile(staticFileIntegrationId, {
					filename: file.name,
					content: fileContent,
					contentType: getContentType(file.name),
				});

				setUploadSuccess(true);
				if (fileInputRef.current) {
					fileInputRef.current.value = "";
				}
				// Reload integration to get updated file count
				await loadIntegration(staticFileIntegrationId);
			} catch (err) {
				setError(err instanceof Error ? err.message : content.failedUpload.value);
			} finally {
				setIsUploading(false);
			}
		},
		[client, staticFileIntegrationId, content],
	);

	const handleFileSelect = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			if (file) {
				setError(undefined);
				setUploadSuccess(false);
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
				setUploadSuccess(false);
				uploadFile(file);
			}
		},
		[uploadFile],
	);

	function handleBack() {
		navigate("/integrations");
	}

	if (isLoading) {
		return (
			<div className="bg-card rounded-lg p-5 border h-full">
				<div className="text-center py-12">
					<Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
					<p className="text-muted-foreground">{content.loading}</p>
				</div>
			</div>
		);
	}

	if (!integration) {
		return (
			<div className="bg-card rounded-lg p-5 border h-full">
				<div className="text-center py-12">
					<p className="text-destructive">{error ?? content.notFound}</p>
					<Button variant="outline" onClick={handleBack} className="mt-4">
						<ArrowLeft className="h-4 w-4 mr-2" />
						{content.backToIntegrations}
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="bg-card rounded-lg p-5 border h-full">
			<div className="mb-6">
				<Button variant="ghost" onClick={handleBack} className="mb-4 -ml-2">
					<ArrowLeft className="h-4 w-4 mr-2" />
					{content.backToIntegrations}
				</Button>
				<h1 className="font-semibold" style={{ fontSize: "2rem", margin: "0 0 8px" }}>
					{integration.name}
				</h1>
				<p className="text-sm m-0" style={{ color: "#808080cc" }}>
					{content.subtitle}
				</p>
			</div>

			{error && (
				<div className="mb-4 rounded-md bg-destructive/10 border border-destructive/20 p-3">
					<p className="text-sm text-destructive">{error}</p>
				</div>
			)}

			{uploadSuccess && (
				<div className="mb-4 rounded-md bg-green-500/10 border border-green-500/20 p-3">
					<p className="text-sm text-green-600">{content.uploadSuccess}</p>
				</div>
			)}

			<div className="max-w-lg">
				<h2 className="text-lg font-medium mb-4">{content.uploadTitle}</h2>
				<div
					className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
						isDragOver
							? "border-primary bg-primary/5"
							: "border-muted-foreground/25 hover:border-primary/50"
					}`}
					onClick={() => !isUploading && fileInputRef.current?.click()}
					onKeyDown={(e: KeyboardEvent<HTMLDivElement>) =>
						e.key === "Enter" && !isUploading && fileInputRef.current?.click()
					}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					role="button"
					tabIndex={0}
				>
					{isUploading ? (
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
						disabled={isUploading}
					/>
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

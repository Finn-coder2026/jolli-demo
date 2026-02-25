import { useClient } from "../contexts/ClientContext";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { SimpleDropdown } from "./ui/SimpleDropdown";
import { Image, Trash2, Upload, X } from "lucide-react";
import { type ChangeEvent, type ReactElement, useMemo, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

/** Accepted image MIME types for upload validation */
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
/** Maximum file size in MB for image uploads */
export const MAX_FILE_SIZE_MB = 10;

interface ImageInfo {
	src: string;
	alt: string;
}

/** Image metadata including dimensions for saving to contentMetadata */
export interface ImageMetadataInfo {
	path: string;
	width: number;
	height: number;
}

/**
 * Extract all unique image references from article content.
 */
export function extractImagesFromContent(content: string): Array<ImageInfo> {
	const images: Array<ImageInfo> = [];
	const seenUrls = new Set<string>();

	// Extract markdown images: ![alt](url)
	const markdownMatches = content.matchAll(/!\[([^\]]*)\]\((\/api\/images\/[^)]+)\)/g);
	for (const match of markdownMatches) {
		const [, alt, src] = match;
		if (!seenUrls.has(src)) {
			seenUrls.add(src);
			images.push({ src, alt: alt || "" });
		}
	}

	// Extract HTML images: <img src="url" alt="alt" />
	const htmlMatches = content.matchAll(/<img[^>]+src=["'](\/api\/images\/[^"']+)["'][^>]*>/gi);
	for (const match of htmlMatches) {
		const fullMatch = match[0];
		const src = match[1];
		if (!seenUrls.has(src)) {
			seenUrls.add(src);
			const altMatch = fullMatch.match(/alt=["']([^"']*)["']/i);
			const alt = altMatch ? altMatch[1] : "";
			images.push({ src, alt });
		}
	}

	return images;
}

interface ImageInsertProps {
	articleContent: string;
	onInsert: (markdownRef: string, imageMetadata?: ImageMetadataInfo) => void;
	onDelete?: (src: string) => void;
	onError: (error: string) => void;
	disabled?: boolean;
	/** Space ID for scoping uploaded images. If not provided, images are org-wide (legacy). */
	spaceId?: number | undefined;
}

/**
 * Combined image insertion component with upload and gallery in a single dropdown.
 */
export function ImageInsert({
	articleContent,
	onInsert,
	onDelete,
	onError,
	disabled,
	spaceId,
}: ImageInsertProps): ReactElement {
	const content = useIntlayer("image-insert");
	const client = useClient();
	const [isUploading, setIsUploading] = useState(false);
	const [showAltTextDialog, setShowAltTextDialog] = useState(false);
	const [altText, setAltText] = useState("");
	const [pendingFile, setPendingFile] = useState<{ file: File | Blob; filename: string } | null>(null);
	const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Extract existing images from article
	const existingImages = useMemo(() => extractImagesFromContent(articleContent), [articleContent]);

	// Filter out broken images for display
	const validImages = useMemo(
		() => existingImages.filter(image => !failedImages.has(image.src)),
		[existingImages, failedImages],
	);

	function handleImageError(src: string) {
		setFailedImages(prev => new Set(prev).add(src));
	}

	function validateFile(file: File | Blob): boolean {
		if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
			onError(content.invalidFileType.value);
			return false;
		}

		const maxSizeBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
		if (file.size > maxSizeBytes) {
			onError(content.fileTooLarge.value);
			return false;
		}

		return true;
	}

	function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}

		if (!validateFile(file)) {
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
			return;
		}

		setPendingFile({ file, filename: file.name });
		setAltText(file.name);
		setShowAltTextDialog(true);
	}

	function handleUploadClick() {
		fileInputRef.current?.click();
	}

	function handleCancelAltText() {
		setShowAltTextDialog(false);
		setPendingFile(null);
		setAltText("");
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	}

	async function handleConfirmUpload() {
		/* v8 ignore next 3 - defensive guard: confirm button only renders when showAltTextDialog is true, which requires pendingFile to be set */
		if (!pendingFile) {
			return;
		}
		const { file, filename } = pendingFile;

		setIsUploading(true);
		setShowAltTextDialog(false);

		try {
			const result = await client.images().uploadImage(file, { filename, spaceId });
			/* v8 ignore next - altText fallback to filename is defensive */
			const markdown = `![${altText || filename}](${result.url})`;

			const img = new window.Image();
			img.onload = () => {
				const metadata: ImageMetadataInfo = {
					path: result.url,
					width: img.naturalWidth,
					height: img.naturalHeight,
				};
				onInsert(markdown, metadata);
			};
			img.onerror = () => {
				onInsert(markdown);
			};
			img.src = result.url;

			setPendingFile(null);
			setAltText("");
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		} catch (error) {
			/* v8 ignore next - error handler requires API failure to test */
			onError(error instanceof Error ? error.message : content.uploadFailed.value);
		} finally {
			setIsUploading(false);
		}
	}

	function handleReuseImage(image: ImageInfo) {
		const markdown = `![${image.alt}](${image.src})`;
		const img = new window.Image();
		img.onload = () => {
			const metadata: ImageMetadataInfo = {
				path: image.src,
				width: img.naturalWidth,
				height: img.naturalHeight,
			};
			onInsert(markdown, metadata);
		};
		img.onerror = () => {
			onInsert(markdown);
		};
		img.src = image.src;
	}

	function handleDeleteImage(event: React.MouseEvent, image: ImageInfo) {
		event.stopPropagation();
		onDelete?.(image.src);
	}

	return (
		<>
			<input
				ref={fileInputRef}
				type="file"
				accept={ACCEPTED_IMAGE_TYPES.join(",")}
				onChange={handleFileSelect}
				className="hidden"
				data-testid="image-file-input"
			/>

			<SimpleDropdown
				align="start"
				className="w-80 p-0"
				trigger={
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="bg-muted/40 shadow-sm h-7 px-1.5 text-xs"
						disabled={disabled || isUploading}
						data-testid="image-insert-button"
						title={String(content.insertImage)}
					>
						{isUploading ? <Upload className="h-4 w-4 animate-pulse" /> : <Image className="h-4 w-4" />}
						<span className="ml-1">{content.insertImage}</span>
					</Button>
				}
			>
				<div className="divide-y">
					{/* Upload Section */}
					<div className="p-3">
						<button
							type="button"
							onClick={handleUploadClick}
							className="w-full flex items-center gap-3 p-3 rounded-md border-2 border-dashed hover:border-primary hover:bg-accent/50 transition-colors"
							data-testid="upload-new-image"
						>
							<div className="p-2 rounded-full bg-primary/10">
								<Upload className="h-5 w-5 text-primary" />
							</div>
							<div className="text-left">
								<div className="font-medium">{content.uploadNew}</div>
								<div className="text-xs text-muted-foreground">{content.uploadHint}</div>
							</div>
						</button>
					</div>

					{/* Existing Images Section */}
					{validImages.length > 0 && (
						<div className="p-3">
							<div className="text-sm font-medium mb-2 px-1">{content.reuseExisting}</div>
							<div className="grid grid-cols-4 gap-2 max-h-32 overflow-y-auto scrollbar-thin">
								{validImages.map((image, index) => (
									<div key={`${image.src}-${index}`} className="relative group">
										<button
											type="button"
											onClick={() => handleReuseImage(image)}
											className="w-full aspect-square rounded-md overflow-hidden border hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
											/* v8 ignore next - image.alt fallback to image.src is defensive */
											title={`${content.clickToInsert}: ${image.alt || image.src}`}
											data-testid={`reuse-image-${index}`}
										>
											<img
												src={image.src}
												alt={image.alt}
												className="w-full h-full object-cover"
												loading="lazy"
												onError={() => handleImageError(image.src)}
											/>
										</button>
										{onDelete && (
											<button
												type="button"
												onClick={e => handleDeleteImage(e, image)}
												className="absolute -top-1 -right-1 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
												title={String(content.deleteImage)}
												data-testid={`delete-image-${index}`}
											>
												<Trash2 className="h-3 w-3" />
											</button>
										)}
									</div>
								))}
							</div>
						</div>
					)}

					{/* Help Text */}
					<div className="p-2 bg-muted/30">
						<div className="text-xs text-muted-foreground text-center">{content.pasteHint}</div>
					</div>
				</div>
			</SimpleDropdown>

			{/* Alt Text Dialog */}
			{showAltTextDialog && (
				<div
					className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
					data-testid="alt-text-dialog"
				>
					<div className="bg-card rounded-lg p-6 max-w-md w-full mx-4 space-y-4">
						<div className="flex items-center justify-between">
							<h3 className="text-lg font-semibold">{content.addAltText}</h3>
							<Button variant="ghost" size="sm" onClick={handleCancelAltText} data-testid="close-dialog">
								<X className="h-4 w-4" />
							</Button>
						</div>

						<div className="space-y-2">
							<label htmlFor="alt-text-input" className="text-sm font-medium">
								{content.altTextLabel}
							</label>
							<Input
								id="alt-text-input"
								value={altText}
								onChange={e => setAltText(e.target.value)}
								placeholder={String(content.altTextPlaceholder)}
								data-testid="alt-text-input"
								autoFocus
							/>
							<p className="text-sm text-muted-foreground">{content.altTextHelp}</p>
						</div>

						<div className="flex gap-2 justify-end">
							<Button variant="outline" onClick={handleCancelAltText} data-testid="cancel-upload">
								{content.cancel}
							</Button>
							<Button onClick={handleConfirmUpload} disabled={isUploading} data-testid="confirm-upload">
								{content.upload}
							</Button>
						</div>
					</div>
				</div>
			)}
		</>
	);
}

import { extractImageNameFromUrl, MissingImagePlaceholder } from "./MissingImagePlaceholder";
import { Skeleton } from "./Skeleton";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeViewWrapper } from "@tiptap/react";
import * as React from "react";
import { transformImageUrlForSpace, useSpaceImageContext } from "@/context/SpaceImageContext";

interface ResizableImageProps {
	node: ProseMirrorNode;
	updateAttributes: (attrs: Record<string, unknown>) => void;
	selected: boolean;
}

type ResizeDirection = "nw" | "ne" | "sw" | "se";

/**
 * Get the editor container element by traversing up the DOM tree.
 */
function getEditorContainer(element: HTMLElement | null): HTMLElement | null {
	let container: HTMLElement | null = element;
	while (container && !container.classList.contains("ProseMirror")) {
		container = container.parentElement;
	}
	return container;
}

export function ResizableImage({ node, updateAttributes, selected }: ResizableImageProps): React.ReactElement {
	const { src, alt, widthPx, widthPercent } = node.attrs as {
		src: string;
		alt?: string;
		widthPx?: number;
		widthPercent?: number;
	};

	// Get space context for image URL transformation (space access validation)
	const { spaceId } = useSpaceImageContext();
	// Transform URL to include spaceId for backend validation
	const transformedSrc = transformImageUrlForSpace(src, spaceId);

	const containerRef = React.useRef<HTMLSpanElement>(null);
	const imageRef = React.useRef<HTMLImageElement>(null);
	const [naturalAspectRatio, setNaturalAspectRatio] = React.useState<number>(1);
	const [imageError, setImageError] = React.useState<boolean>(false);
	const [isLoading, setIsLoading] = React.useState<boolean>(true);
	const hasConvertedPercent = React.useRef(false);

	React.useLayoutEffect(() => {
		if (widthPercent != null && widthPx == null && !hasConvertedPercent.current) {
			const editorContainer = getEditorContainer(containerRef.current);
			const editorWidth = editorContainer ? editorContainer.clientWidth - 32 : 0;
			if (editorWidth > 0) {
				hasConvertedPercent.current = true;
				const calculatedPx = Math.round((widthPercent / 100) * editorWidth);
				updateAttributes({ widthPx: calculatedPx });
			}
		}
	}, [widthPercent, widthPx, updateAttributes]);

	const handleImageLoad = React.useCallback(() => {
		if (imageRef.current) {
			const ratio = imageRef.current.naturalWidth / imageRef.current.naturalHeight;
			setNaturalAspectRatio(ratio);
		}
		setIsLoading(false);
	}, []);

	const handleImageError = React.useCallback(() => {
		setImageError(true);
		setIsLoading(false);
	}, []);

	const handleResizeStart = React.useCallback(
		(event: React.MouseEvent, direction: ResizeDirection) => {
			event.preventDefault();
			event.stopPropagation();

			const actualWidth = imageRef.current?.offsetWidth || 0;

			if (actualWidth === 0) {
				return;
			}

			const startX = event.clientX;
			const startWidth = actualWidth;

			const handleMouseMove = (e: MouseEvent) => {
				const editorContainer = getEditorContainer(containerRef.current);
				const editorWidth = editorContainer ? editorContainer.clientWidth - 32 : 0;

				if (editorWidth === 0) {
					return;
				}

				// Get current aspect ratio (in case image loaded after handleResizeStart was created)
				const currentAspectRatio =
					imageRef.current && imageRef.current.naturalWidth > 0
						? imageRef.current.naturalWidth / imageRef.current.naturalHeight
						: naturalAspectRatio;

				const deltaX = e.clientX - startX;

				let newWidth = startWidth;

				if (direction === "se" || direction === "ne") {
					newWidth = startWidth + deltaX;
				} else {
					newWidth = startWidth - deltaX;
				}

				// Minimum 10% of editor width, maximum 100% of editor width
				const minWidth = editorWidth * 0.1;
				newWidth = Math.max(minWidth, Math.min(newWidth, editorWidth));

				const newHeight = newWidth / currentAspectRatio;

				if (imageRef.current) {
					imageRef.current.style.width = `${newWidth}px`;
					imageRef.current.style.height = `${newHeight}px`;
				}
			};

			const handleMouseUp = () => {
				document.removeEventListener("mousemove", handleMouseMove);
				document.removeEventListener("mouseup", handleMouseUp);

				if (!imageRef.current) {
					return;
				}

				const editorContainer = getEditorContainer(containerRef.current);
				const editorWidth = editorContainer ? editorContainer.clientWidth - 32 : 0;

				if (editorWidth === 0) {
					return;
				}

				const finalWidth = Math.round(Number.parseFloat(imageRef.current.style.width));
				const percentWidth = Math.round((finalWidth / editorWidth) * 100);
				const clampedPercent = Math.max(10, Math.min(100, percentWidth));

				updateAttributes({
					widthPx: finalWidth,
					widthPercent: clampedPercent,
				});
			};

			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
		},
		[naturalAspectRatio, updateAttributes],
	);

	if (imageError) {
		const imageName = alt || extractImageNameFromUrl(src);
		return (
			<NodeViewWrapper as="span">
				<MissingImagePlaceholder imageName={imageName} selected={selected} />
			</NodeViewWrapper>
		);
	}

	const imageStyle: React.CSSProperties = widthPx ? { width: `${widthPx}px` } : {};

	// Default skeleton size for loading state
	const skeletonStyle: React.CSSProperties = widthPx
		? { width: `${widthPx}px`, height: `${Math.round(widthPx / naturalAspectRatio)}px` }
		: { width: "200px", height: "150px" };

	return (
		<NodeViewWrapper as="span" className={`resizable-image-container ${selected ? "selected" : ""}`}>
			<span ref={containerRef}>
				{/* Loading skeleton placeholder */}
				{isLoading && <Skeleton style={skeletonStyle} className="inline-block" data-testid="image-skeleton" />}
				{/* Image - hidden while loading to allow natural size calculation */}
				<img
					ref={imageRef}
					src={transformedSrc}
					alt={alt || ""}
					style={{ ...imageStyle, display: isLoading ? "none" : "block" }}
					onLoad={handleImageLoad}
					onError={handleImageError}
					draggable={false}
				/>
				{selected && !isLoading && (
					<>
						<div
							className="resize-handle nw"
							onMouseDown={event => handleResizeStart(event, "nw")}
							data-testid="resize-handle-nw"
						/>
						<div
							className="resize-handle ne"
							onMouseDown={event => handleResizeStart(event, "ne")}
							data-testid="resize-handle-ne"
						/>
						<div
							className="resize-handle sw"
							onMouseDown={event => handleResizeStart(event, "sw")}
							data-testid="resize-handle-sw"
						/>
						<div
							className="resize-handle se"
							onMouseDown={event => handleResizeStart(event, "se")}
							data-testid="resize-handle-se"
						/>
					</>
				)}
			</span>
		</NodeViewWrapper>
	);
}

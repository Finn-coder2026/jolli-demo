import { extractImageNameFromUrl, MissingImagePlaceholder } from "./ui/MissingImagePlaceholder";
import * as React from "react";
import { transformImageUrlForSpace, useSpaceImageContext } from "@/context/SpaceImageContext";

interface MarkdownImageProps {
	src?: string;
	alt?: string;
	"data-width-percent"?: string;
}

export function MarkdownImage({
	src,
	alt,
	"data-width-percent": widthPercent,
}: MarkdownImageProps): React.ReactElement {
	const [imageError, setImageError] = React.useState<boolean>(false);

	// Get space context for image URL transformation (space access validation)
	const { spaceId } = useSpaceImageContext();

	const handleError = React.useCallback(() => {
		setImageError(true);
	}, []);

	if (imageError || !src) {
		const imageName = alt || extractImageNameFromUrl(src || "");
		return <MissingImagePlaceholder imageName={imageName} />;
	}

	// Transform URL to include spaceId for backend validation
	const transformedSrc = transformImageUrlForSpace(src, spaceId);

	const style: React.CSSProperties | undefined = widthPercent ? { width: `${widthPercent}%` } : undefined;

	return <img src={transformedSrc} alt={alt || ""} style={style} onError={handleError} />;
}

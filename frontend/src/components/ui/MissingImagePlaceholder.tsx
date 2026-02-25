import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./Tooltip";
import * as React from "react";
import { useIntlayer } from "react-intlayer";

/**
 * Extracts the image filename from the URL path.
 * For URLs like "/api/images/tenant/org/_default/filename.png", returns "filename.png"
 */
export function extractImageNameFromUrl(url: string): string {
	try {
		const urlPath = url.startsWith("http") ? new URL(url).pathname : url;
		const segments = urlPath.split("/");
		return segments[segments.length - 1] || url;
	} catch {
		const segments = url.split("/");
		return segments[segments.length - 1] || url;
	}
}

export interface MissingImagePlaceholderProps {
	imageName: string;
	selected?: boolean;
	className?: string;
}

export function MissingImagePlaceholder({
	imageName,
	selected = false,
	className,
}: MissingImagePlaceholderProps): React.ReactElement {
	const i18n = useIntlayer("resizable-image");
	const [tooltipOpen, setTooltipOpen] = React.useState<boolean>(false);

	return (
		<span
			className={`missing-image-placeholder ${selected ? "selected" : ""} ${className ?? ""}`}
			data-testid="missing-image-placeholder"
		>
			<TooltipProvider>
				<Tooltip open={tooltipOpen} onOpenChange={setTooltipOpen}>
					<TooltipTrigger
						asChild
						onMouseEnter={() => setTooltipOpen(true)}
						onMouseLeave={() => setTooltipOpen(false)}
					>
						<span>
							<span>![[</span>
							<span style={{ color: "#9287DF" }} data-testid="missing-image-name">
								{imageName}
							</span>
							<span>]]</span>
						</span>
					</TooltipTrigger>
					<TooltipContent>
						<span data-testid="missing-image-tooltip">
							{imageName} {i18n.couldNotBeFound}
						</span>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</span>
	);
}

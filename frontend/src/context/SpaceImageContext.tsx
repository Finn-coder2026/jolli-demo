import { createContext, type ReactNode, useContext } from "react";

interface SpaceImageContextValue {
	/** The article's space ID for image access validation. Undefined means org-wide access. */
	spaceId?: number | undefined;
}

const SpaceImageContext = createContext<SpaceImageContextValue>({});

interface SpaceImageProviderProps {
	children: ReactNode;
	spaceId?: number | undefined;
}

/**
 * Provider for space-scoped image rendering.
 * When images are rendered inside this provider, they will include the spaceId
 * as a query parameter to enforce space access validation on the backend.
 */
export function SpaceImageProvider({ children, spaceId }: SpaceImageProviderProps) {
	return <SpaceImageContext.Provider value={{ spaceId }}>{children}</SpaceImageContext.Provider>;
}

/**
 * Hook to get the current space ID for image URL transformation.
 * Returns the spaceId if within a SpaceImageProvider, undefined otherwise.
 */
export function useSpaceImageContext(): SpaceImageContextValue {
	return useContext(SpaceImageContext);
}

/**
 * Transform an image URL to include the spaceId query parameter for space access validation.
 * Only transforms URLs that point to the /api/images/ endpoint.
 *
 * @param src - Original image source URL
 * @param spaceId - Space ID to include in the URL
 * @returns Transformed URL with spaceId query parameter
 */
export function transformImageUrlForSpace(src: string, spaceId?: number): string {
	// Only transform /api/images/ URLs
	if (!src.startsWith("/api/images/") || spaceId === undefined) {
		return src;
	}

	// Add spaceId as query parameter
	const separator = src.includes("?") ? "&" : "?";
	return `${src}${separator}spaceId=${spaceId}`;
}

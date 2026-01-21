import { createContext, type ReactElement, type ReactNode, useContext, useMemo } from "react";

export interface VersionHistoryContextValue {
	/**
	 * Called when a version is successfully restored.
	 * The parent component should refresh the document data.
	 */
	onVersionRestored: () => void;
}

const VersionHistoryContext = createContext<VersionHistoryContextValue | undefined>(undefined);

export interface VersionHistoryProviderProps {
	children: ReactNode;
	onVersionRestored: () => void;
}

export function VersionHistoryProvider({ children, onVersionRestored }: VersionHistoryProviderProps): ReactElement {
	const value = useMemo(
		() => ({
			onVersionRestored,
		}),
		[onVersionRestored],
	);

	return <VersionHistoryContext.Provider value={value}>{children}</VersionHistoryContext.Provider>;
}

export function useVersionHistory(): VersionHistoryContextValue {
	const context = useContext(VersionHistoryContext);
	if (!context) {
		throw new Error("useVersionHistory must be used within a VersionHistoryProvider");
	}
	return context;
}

/**
 * Optional hook that returns undefined if not within a provider.
 * Useful for components that may or may not be within the provider.
 */
export function useVersionHistoryOptional(): VersionHistoryContextValue | undefined {
	return useContext(VersionHistoryContext);
}

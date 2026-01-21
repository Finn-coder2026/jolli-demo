import { useExitHandler } from "../hooks/useExitHandler";
import type React from "react";
import type { Dispatch, SetStateAction } from "react";
import { createContext, useContext } from "react";

export interface ExitContextValue {
	shouldExit: boolean;
	setShouldExit: Dispatch<SetStateAction<boolean>>;
	isMountedRef: React.MutableRefObject<boolean>;
	abortControllerRef: React.MutableRefObject<AbortController | null>;
}

export const ExitContext = createContext<ExitContextValue | undefined>(undefined);

export function useExitContext(): ExitContextValue {
	const context = useContext(ExitContext);
	if (context === undefined) {
		throw new Error("useExitContext must be used within an ExitProvider");
	}
	return context;
}

interface ExitProviderProps {
	onExit: () => void;
	children: React.ReactNode;
}

/**
 * ExitProvider manages exit state and cleanup for the application
 * It handles graceful shutdown, request abortion, and component unmounting
 */
export function ExitProvider({ onExit, children }: ExitProviderProps): React.ReactElement {
	const exitHandler = useExitHandler(onExit);

	return <ExitContext.Provider value={exitHandler}>{children}</ExitContext.Provider>;
}

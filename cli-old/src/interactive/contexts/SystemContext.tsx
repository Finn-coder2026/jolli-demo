import type React from "react";
import type { Dispatch, SetStateAction } from "react";
import { createContext, useContext, useState } from "react";

export interface SystemContextValue {
	systemMessage: string | null;
	setSystemMessage: Dispatch<SetStateAction<string | null>>;
	viewMode: string;
	setViewMode: Dispatch<SetStateAction<string>>;
}

export const SystemContext = createContext<SystemContextValue | undefined>(undefined);

export function useSystemContext(): SystemContextValue {
	const context = useContext(SystemContext);
	if (!context) {
		throw new Error("useSystemContext must be used within a SystemProvider");
	}
	return context;
}

export function SystemProvider({ children }: { children: React.ReactNode }): React.ReactElement {
	const [viewMode, setViewMode] = useState<string>("chat");
	const [systemMessage, setSystemMessage] = useState<string | null>(null);

	const value: SystemContextValue = {
		systemMessage,
		setSystemMessage,
		viewMode,
		setViewMode,
	};

	return <SystemContext.Provider value={value}>{children}</SystemContext.Provider>;
}

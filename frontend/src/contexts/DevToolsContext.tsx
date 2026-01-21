import { useClient } from "./ClientContext";
import type { DevToolsInfoResponse } from "jolli-common";
import { createContext, type ReactElement, type ReactNode, useContext, useEffect, useState } from "react";

interface DevToolsContextType {
	devToolsEnabled: boolean;
	githubAppCreatorEnabled: boolean;
	jobTesterEnabled: boolean;
	dataClearerEnabled: boolean;
	draftGeneratorEnabled: boolean;
	devToolsInfo: DevToolsInfoResponse | undefined;
	isLoading: boolean;
	error: string | undefined;
}

const DevToolsContext = createContext<DevToolsContextType | undefined>(undefined);

export function DevToolsProvider({ children }: { children: ReactNode }): ReactElement {
	const client = useClient();
	const [devToolsInfo, setDevToolsInfo] = useState<DevToolsInfoResponse | undefined>(undefined);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | undefined>(undefined);

	useEffect(() => {
		async function loadDevToolsInfo() {
			try {
				setIsLoading(true);
				const info = await client.devTools().getDevToolsInfo();
				setDevToolsInfo(info);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load dev tools info");
			} finally {
				setIsLoading(false);
			}
		}
		loadDevToolsInfo().then();
	}, [client]);

	// Always render children - provide context with appropriate values
	// The devToolsEnabled flag allows components to conditionally show dev tools UI
	const value: DevToolsContextType = {
		devToolsEnabled: devToolsInfo?.enabled ?? false,
		githubAppCreatorEnabled: devToolsInfo?.githubAppCreatorEnabled ?? false,
		jobTesterEnabled: devToolsInfo?.jobTesterEnabled ?? false,
		dataClearerEnabled: devToolsInfo?.dataClearerEnabled ?? false,
		draftGeneratorEnabled: devToolsInfo?.draftGeneratorEnabled ?? false,
		devToolsInfo,
		isLoading,
		error,
	};

	return <DevToolsContext.Provider value={value}>{children}</DevToolsContext.Provider>;
}

export function useDevTools(): DevToolsContextType {
	const context = useContext(DevToolsContext);
	if (context === undefined) {
		throw new Error("useDevTools must be used within a DevToolsProvider");
	}
	return context;
}

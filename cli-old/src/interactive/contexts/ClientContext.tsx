import { useExitContext } from "./ExitContext";
import type { Client } from "jolli-common";
import type React from "react";
import type { MutableRefObject } from "react";
import { createContext, useContext } from "react";

export interface ClientContextValue {
	client: Client;
	isMountedRef: MutableRefObject<boolean>;
}

export const ClientContext = createContext<ClientContextValue | undefined>(undefined);

export function useClientContext(): ClientContextValue {
	const context = useContext(ClientContext);
	if (!context) {
		throw new Error("useClientContext must be used within a ClientProvider");
	}
	return context;
}

interface ClientProviderProps {
	client: Client;
	children: React.ReactNode;
}

/**
 * ClientProvider manages client instance and integrates with exit handling
 * It provides access to the client and isMountedRef for request lifecycle management
 */
export function ClientProvider({ client, children }: ClientProviderProps): React.ReactElement {
	const { isMountedRef } = useExitContext();

	const value: ClientContextValue = {
		client,
		isMountedRef,
	};

	return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}

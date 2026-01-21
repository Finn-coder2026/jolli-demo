import { type Client, type ClientCallbacks, createClient } from "jolli-common";
import { createContext, type ReactElement, type ReactNode, useContext, useMemo } from "react";

const ClientContext = createContext<Client | undefined>(undefined);

export interface ClientProviderProps {
	children: ReactNode;
	client?: Client;
	/**
	 * Callbacks for client events like unauthorized responses
	 */
	callbacks?: ClientCallbacks;
}

export function ClientProvider({ children, client: providedClient, callbacks }: ClientProviderProps): ReactElement {
	const client = useMemo(() => {
		return providedClient ?? createClient("", undefined, callbacks);
	}, [providedClient, callbacks]);

	return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

export function useClient(): Client {
	const context = useContext(ClientContext);
	if (!context) {
		throw new Error("useClient must be used within a ClientProvider");
	}
	return context;
}

import { useClientContext } from "./ClientContext";
import { useSystemContext } from "./SystemContext";
import type React from "react";
import { createContext, useContext, useState } from "react";

export interface AdminContextValue {
	selectedUtility: string | null;
	confirmationPending: boolean;
	confirmationMessage: string | null;
	loading: boolean;
	error: string | null;
	handleSelectUtility: (utility: string) => void;
	handleConfirm: (confirmed: boolean) => Promise<void>;
	handleBack: () => void;
}

export const AdminContext = createContext<AdminContextValue | undefined>(undefined);

export function useAdminContext(): AdminContextValue {
	const context = useContext(AdminContext);
	if (!context) {
		throw new Error("useAdminContext must be used within an AdminProvider");
	}
	return context;
}

export function AdminProvider({ children }: { children: React.ReactNode }): React.ReactElement {
	const { client } = useClientContext();
	const { setSystemMessage, setViewMode } = useSystemContext();

	const [selectedUtility, setSelectedUtility] = useState<string | null>(null);
	const [confirmationPending, setConfirmationPending] = useState(false);
	const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const resetState = () => {
		setSelectedUtility(null);
		setConfirmationPending(false);
		setConfirmationMessage(null);
		setLoading(false);
		setError(null);
	};

	const handleSelectUtility = (utility: string) => {
		if (utility === "back") {
			handleBack();
			return;
		}

		setSelectedUtility(utility);
		setConfirmationPending(true);

		// Set confirmation message based on utility
		if (utility === "clear-all-articles") {
			setConfirmationMessage("Are you sure you want to clear all articles? This cannot be undone.");
		}
	};

	const handleConfirm = async (confirmed: boolean) => {
		if (!confirmed) {
			// User selected No - reset confirmation and show utilities list again
			setConfirmationPending(false);
			setConfirmationMessage(null);
			setSelectedUtility(null);
			setError(null);
			return;
		}

		// User selected Yes - execute the utility
		try {
			setLoading(true);
			setError(null);

			if (selectedUtility === "clear-all-articles") {
				await client.docs().clearAll();
				setSystemMessage("✓ All articles cleared successfully");
			}

			// Reset state and return to chat view
			resetState();
			setViewMode("chat");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Operation failed");
			setLoading(false);
		}
	};

	const handleBack = () => {
		resetState();
		setViewMode("chat");
	};

	const value: AdminContextValue = {
		selectedUtility,
		confirmationPending,
		confirmationMessage,
		loading,
		error,
		handleSelectUtility,
		handleConfirm,
		handleBack,
	};

	return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

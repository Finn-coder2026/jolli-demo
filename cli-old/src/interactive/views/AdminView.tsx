import { AdminUtilitiesList } from "../components/AdminUtilitiesList";
import { ConfirmationPrompt } from "../components/ConfirmationPrompt";
import { useAdminContext } from "../contexts";
import type { ViewDefinition } from "./types";
import type React from "react";

function AdminViewComponent(): React.ReactElement {
	const { confirmationPending, confirmationMessage, loading, error, handleSelectUtility, handleConfirm, handleBack } =
		useAdminContext();

	// Show confirmation prompt if a utility has been selected
	if (confirmationPending && confirmationMessage) {
		return (
			<ConfirmationPrompt
				message={confirmationMessage}
				onConfirm={handleConfirm}
				loading={loading}
				error={error}
			/>
		);
	}

	// Show utilities list by default
	return <AdminUtilitiesList onSelect={handleSelectUtility} onBack={handleBack} />;
}

export const adminView: ViewDefinition = {
	name: "admin",
	component: AdminViewComponent,
};

import { ConvoList } from "../components/ConvoList";
import { useConvoContext, useSystemContext } from "../contexts";
import type { ViewDefinition } from "./types";
import type React from "react";

function ConvosViewComponent(): React.ReactElement {
	const { convos, activeConvoId, handleSwitchConvo, handleNewConvo } = useConvoContext();
	const { setViewMode } = useSystemContext();

	return (
		<ConvoList
			convos={convos}
			activeConvoId={activeConvoId}
			onSelect={handleSwitchConvo}
			onNewConvo={handleNewConvo}
			onBack={() => setViewMode("chat")}
		/>
	);
}

export const convosView: ViewDefinition = {
	name: "conversations",
	component: ConvosViewComponent,
};

import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface LoadingStateProps {
	message?: string;
}

export function LoadingState({ message }: LoadingStateProps): ReactElement {
	const content = useIntlayer("loading-state");
	const displayMessage = message ?? content.loading;

	return <p className="text-muted-foreground text-center py-8">{displayMessage}</p>;
}

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/Dialog";
import { useCurrentUser } from "../../contexts/CurrentUserContext";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

interface UserContextDialogProps {
	/** Whether the dialog is open. */
	open: boolean;
	/** Callback when the dialog open state changes. */
	onOpenChange: (open: boolean) => void;
}

/**
 * Dialog that displays the current JolliCurrentUserContext state for debugging.
 * Accessible from the user profile menu so context can be inspected from any page.
 */
export function UserContextDialog({ open, onOpenChange }: UserContextDialogProps): ReactElement | null {
	if (!open) {
		return null;
	}

	return <UserContextDialogContent onOpenChange={onOpenChange} />;
}

/**
 * Inner content rendered only when the dialog is open.
 * Separated so that context hooks are only called when the dialog is visible.
 */
function UserContextDialogContent({ onOpenChange }: { onOpenChange: (open: boolean) => void }): ReactElement {
	const content = useIntlayer("bottom-utilities");
	const { userContext } = useCurrentUser();
	const { agentHubContext } = userContext;

	return (
		<Dialog open={true} onOpenChange={onOpenChange}>
			<DialogContent data-testid="user-context-dialog">
				<DialogHeader>
					<DialogTitle>{content.userContext}</DialogTitle>
					<DialogDescription>{content.userContextDescription}</DialogDescription>
				</DialogHeader>

				<div className="space-y-2 text-sm">
					<div className="flex items-center gap-2" data-testid="context-active">
						<span className="font-medium text-muted-foreground">{content.contextActive}:</span>
						<span>{agentHubContext?.active ? "true" : "false"}</span>
					</div>
					<div className="flex items-center gap-2" data-testid="context-conversation-id">
						<span className="font-medium text-muted-foreground">{content.contextConversationId}:</span>
						<span>{agentHubContext?.conversationId ?? content.contextNone}</span>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

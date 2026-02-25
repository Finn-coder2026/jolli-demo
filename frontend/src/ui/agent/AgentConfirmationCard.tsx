import type { PendingConfirmation } from "jolli-common";
import { CheckCircle2, ShieldAlert, XCircle } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface AgentConfirmationCardProps {
	/** The pending confirmation to display */
	readonly confirmation: PendingConfirmation;
	/** Called when the user approves the action */
	readonly onApprove: (confirmationId: string) => void;
	/** Called when the user denies the action */
	readonly onDeny: (confirmationId: string) => void;
}

/**
 * Inline confirmation card rendered in the message stream.
 * Shows the tool name, description, and approve/deny buttons.
 */
export function AgentConfirmationCard({ confirmation, onApprove, onDeny }: AgentConfirmationCardProps): ReactElement {
	const content = useIntlayer("agent-page");

	return (
		<div
			className="mx-auto max-w-3xl my-3 rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 p-4"
			data-testid="confirmation-card"
			data-confirmation-id={confirmation.confirmationId}
		>
			<div className="flex items-start gap-3">
				<ShieldAlert className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
				<div className="flex-1 min-w-0">
					<p className="text-sm font-medium text-foreground" data-testid="confirmation-title">
						{content.confirmAction}
					</p>
					<p className="mt-1 text-sm text-muted-foreground" data-testid="confirmation-description">
						{confirmation.description}
					</p>
					<div className="mt-3 flex gap-2">
						<button
							type="button"
							onClick={() => onApprove(confirmation.confirmationId)}
							className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
							data-testid="confirmation-approve"
						>
							<CheckCircle2 className="h-3.5 w-3.5" />
							{content.approve}
						</button>
						<button
							type="button"
							onClick={() => onDeny(confirmation.confirmationId)}
							className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
							data-testid="confirmation-deny"
						>
							<XCircle className="h-3.5 w-3.5" />
							{content.deny}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

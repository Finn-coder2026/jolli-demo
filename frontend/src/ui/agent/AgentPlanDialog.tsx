import { MarkdownContent } from "../../components/MarkdownContent";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/Dialog";
import { AgentPlanBadge } from "./AgentPlanBadge";
import type { AgentPlanPhase } from "jolli-common";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface AgentPlanDialogProps {
	/** Whether the dialog is open */
	readonly open: boolean;
	/** Callback when open state changes */
	readonly onOpenChange: (open: boolean) => void;
	/** The plan markdown content (undefined when no plan has been created yet) */
	readonly plan: string | undefined;
	/** The current plan phase */
	readonly phase: AgentPlanPhase;
}

/**
 * Modal dialog displaying the agent's plan as rendered markdown.
 */
export function AgentPlanDialog({ open, onOpenChange, plan, phase }: AgentPlanDialogProps): ReactElement {
	const content = useIntlayer("agent-page");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="plan-dialog">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{content.agentPlan}
						<AgentPlanBadge phase={phase} />
					</DialogTitle>
				</DialogHeader>
				{plan ? (
					<div className="prose prose-sm dark:prose-invert max-w-none" data-testid="plan-dialog-content">
						<MarkdownContent>{plan}</MarkdownContent>
					</div>
				) : (
					<p className="text-sm text-muted-foreground italic" data-testid="plan-dialog-empty">
						{content.planEmpty}
					</p>
				)}
			</DialogContent>
		</Dialog>
	);
}

import { cn } from "../../common/ClassNameUtils";
import type { AgentPlanPhase } from "jolli-common";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface AgentPlanBadgeProps {
	/** The current plan phase */
	readonly phase: AgentPlanPhase;
}

/** Maps a plan phase to its Tailwind color classes. */
function phaseColors(phase: AgentPlanPhase): string {
	switch (phase) {
		case "planning":
			return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
		case "executing":
			return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
		case "complete":
			return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
	}
}

/**
 * Small colored badge showing the current plan phase.
 */
export function AgentPlanBadge({ phase }: AgentPlanBadgeProps): ReactElement {
	const content = useIntlayer("agent-page");

	const labels: Record<AgentPlanPhase, string> = {
		planning: content.phasePlanning.value,
		executing: content.phaseExecuting.value,
		complete: content.phaseComplete.value,
	};

	return (
		<span
			className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", phaseColors(phase))}
			data-testid="plan-phase-badge"
			data-phase={phase}
		>
			{labels[phase]}
		</span>
	);
}

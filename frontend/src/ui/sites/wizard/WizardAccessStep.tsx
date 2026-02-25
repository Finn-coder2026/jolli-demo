import { AccessOption } from "../AccessOption";
import { AlertCircle, Globe, Lock } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

export interface AccessStepContent {
	accessTitle: ReactNode;
	accessDescription: ReactNode;
	accessPublicTitle: ReactNode;
	accessPublicDescription: ReactNode;
	accessRestrictedTitle: ReactNode;
	accessRestrictedDescription: ReactNode;
	accessRestrictedNote: ReactNode;
	useDefaultsNote: ReactNode;
}

export interface WizardAccessStepProps {
	jwtAuthEnabled: boolean;
	usedRememberedAccess: boolean;
	creating: boolean;
	content: AccessStepContent;
	onJwtAuthChange: (enabled: boolean) => void;
}

export function WizardAccessStep({
	jwtAuthEnabled,
	usedRememberedAccess,
	creating,
	content,
	onJwtAuthChange,
}: WizardAccessStepProps): ReactElement {
	return (
		<div className="space-y-6" role="radiogroup">
			<div>
				<h2 className="text-lg font-semibold mb-1">{content.accessTitle}</h2>
				<p className="text-sm text-muted-foreground">{content.accessDescription}</p>
			</div>

			{usedRememberedAccess && <p className="text-xs text-muted-foreground">{content.useDefaultsNote}</p>}

			<AccessOption
				selected={!jwtAuthEnabled}
				disabled={creating}
				testId="access-public"
				icon={<Globe className="h-4 w-4 text-muted-foreground" />}
				title={content.accessPublicTitle}
				description={content.accessPublicDescription}
				onClick={() => onJwtAuthChange(false)}
			/>

			<AccessOption
				selected={jwtAuthEnabled}
				disabled={creating}
				testId="access-restricted"
				icon={<Lock className="h-4 w-4 text-muted-foreground" />}
				title={content.accessRestrictedTitle}
				description={content.accessRestrictedDescription}
				onClick={() => onJwtAuthChange(true)}
			/>

			{jwtAuthEnabled && (
				<div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
					<div className="flex items-start gap-2">
						<AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
						<p className="text-sm text-amber-700 dark:text-amber-400">{content.accessRestrictedNote}</p>
					</div>
				</div>
			)}
		</div>
	);
}

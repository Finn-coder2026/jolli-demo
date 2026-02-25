import { Input } from "../../../components/ui/Input";
import { SubdomainInput } from "../SubdomainInput";
import type { ReactElement, ReactNode } from "react";

export interface BasicsStepContent {
	basicsTitle: ReactNode;
	basicsDescription: ReactNode;
	displayNameLabel: ReactNode;
	displayNamePlaceholder: { value: string };
	displayNameHelp: ReactNode;
	siteNameLabel: ReactNode;
	siteNamePlaceholder: { value: string };
	siteNameHelp: ReactNode;
}

export interface WizardBasicsStepProps {
	name: string;
	displayName: string;
	subdomain: string;
	siteNameError: string | undefined;
	domainSuffix: string;
	creating: boolean;
	content: BasicsStepContent;
	onNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	onDisplayNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	onSubdomainChange: (value: string) => void;
}

export function WizardBasicsStep({
	name,
	displayName,
	subdomain,
	siteNameError,
	domainSuffix,
	creating,
	content,
	onNameChange,
	onDisplayNameChange,
	onSubdomainChange,
}: WizardBasicsStepProps): ReactElement {
	return (
		<div className="space-y-6 max-w-lg">
			<div>
				<h2 className="text-lg font-semibold mb-1">{content.basicsTitle}</h2>
				<p className="text-sm text-muted-foreground">{content.basicsDescription}</p>
			</div>

			<div className="space-y-4">
				<div>
					<label className="block text-sm font-medium mb-1.5">
						{content.displayNameLabel} <span className="text-red-500">*</span>
					</label>
					<Input
						value={displayName}
						onChange={onDisplayNameChange}
						placeholder={content.displayNamePlaceholder.value}
						disabled={creating}
						autoFocus
						data-testid="display-name-input"
					/>
					<p className="text-xs text-muted-foreground mt-1.5">{content.displayNameHelp}</p>
				</div>

				<div>
					<label className="block text-sm font-medium mb-1.5">
						{content.siteNameLabel} <span className="text-red-500">*</span>
					</label>
					<Input
						value={name}
						onChange={onNameChange}
						placeholder={content.siteNamePlaceholder.value}
						disabled={creating}
						className={siteNameError ? "border-red-500" : ""}
						data-testid="site-name-input"
					/>
					{siteNameError ? (
						<p className="text-xs text-red-500 mt-1.5">{siteNameError}</p>
					) : (
						<p className="text-xs text-muted-foreground mt-1.5">{content.siteNameHelp}</p>
					)}
				</div>

				<SubdomainInput
					value={subdomain}
					onChange={onSubdomainChange}
					siteName={name}
					disabled={creating}
					domainSuffix={domainSuffix}
				/>
			</div>
		</div>
	);
}

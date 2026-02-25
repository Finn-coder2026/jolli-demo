import { AccessOption } from "../AccessOption";
import { SectionHeader } from "../SectionHeader";
import type { JwtAuthMode, SiteWithUpdate } from "jolli-common";
import { Globe, Info, KeyRound, Lock } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

interface AuthSettingsSectionProps {
	docsite: SiteWithUpdate;
	saving: boolean;
	onUpdate: (enabled: boolean, mode: JwtAuthMode) => Promise<void>;
}

export function AuthSettingsSection({ docsite, saving, onUpdate }: AuthSettingsSectionProps): ReactElement {
	const content = useIntlayer("site-settings-tab");

	const currentEnabled = docsite.metadata?.jwtAuth?.enabled ?? false;

	return (
		<section className="space-y-4" data-testid="auth-settings-section">
			<SectionHeader
				icon={KeyRound}
				title={content.authenticationTitle}
				description={content.authenticationDescription}
				trailing={
					saving && (
						<span className="text-xs text-muted-foreground animate-pulse ml-auto">{content.saving}</span>
					)
				}
			/>

			<div className="space-y-3">
				<AccessOption
					selected={!currentEnabled}
					disabled={saving || docsite.status !== "active"}
					testId="access-public"
					icon={<Globe className="h-4 w-4 text-muted-foreground" />}
					title={content.accessPublicTitle}
					description={content.accessPublicDescription}
					onClick={() => onUpdate(false, "full")}
				/>

				<AccessOption
					selected={currentEnabled}
					disabled={saving || docsite.status !== "active"}
					testId="access-restricted"
					icon={<Lock className="h-4 w-4 text-muted-foreground" />}
					title={content.accessRestrictedTitle}
					description={content.accessRestrictedDescription}
					onClick={() => onUpdate(true, "full")}
				/>

				{currentEnabled ? (
					<div
						className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
						data-testid="auth-rebuild-note"
					>
						<Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
						<span className="text-xs text-amber-700 dark:text-amber-300">
							{content.accessRestrictedNote} {content.authRebuildNote}
						</span>
					</div>
				) : (
					<div
						className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border"
						data-testid="auth-rebuild-note"
					>
						<Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-muted-foreground" />
						<span className="text-xs text-muted-foreground">{content.authRebuildNote}</span>
					</div>
				)}
			</div>
		</section>
	);
}

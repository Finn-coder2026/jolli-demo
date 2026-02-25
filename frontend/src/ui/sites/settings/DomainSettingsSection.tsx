import { Button } from "../../../components/ui/Button";
import { getDefaultSiteDomain, getVerifiedCustomDomain } from "../../../util/UrlUtil";
import { CustomDomainManager } from "../CustomDomainManager";
import { SectionHeader } from "../SectionHeader";
import type { SiteWithUpdate } from "jolli-common";
import { Globe } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

interface DomainSettingsSectionProps {
	docsite: SiteWithUpdate;
	showManager: boolean;
	onToggleManager: () => void;
	onDocsiteUpdate: (site: SiteWithUpdate) => void;
}

export function DomainSettingsSection({
	docsite,
	showManager,
	onToggleManager,
	onDocsiteUpdate,
}: DomainSettingsSectionProps): ReactElement {
	const content = useIntlayer("site-settings-tab");

	const verifiedCustomDomain = getVerifiedCustomDomain(docsite);
	const defaultDomain = getDefaultSiteDomain(docsite);

	return (
		<section className="space-y-4" data-testid="domain-settings-section">
			<SectionHeader icon={Globe} title={content.domainTitle} description={content.domainDescription} />

			<div className="border rounded-lg p-4 space-y-4">
				<div className="flex items-center justify-between">
					<div>
						<div className="text-sm font-medium">
							{verifiedCustomDomain ? content.currentDomain : content.defaultDomain}
						</div>
						<div className="text-sm text-muted-foreground font-mono" data-testid="current-domain-value">
							{verifiedCustomDomain || defaultDomain || "\u2014"}
						</div>
					</div>
					{docsite.status === "active" && (
						<Button
							variant="outline"
							size="sm"
							onClick={onToggleManager}
							data-testid="toggle-domain-manager"
						>
							{showManager
								? content.hideDomainManager
								: verifiedCustomDomain
									? content.manageDomain
									: content.addDomain}
						</Button>
					)}
				</div>

				{showManager && docsite.status === "active" && (
					<div className="pt-4 border-t" data-testid="domain-manager-expanded">
						<CustomDomainManager site={docsite} onUpdate={onDocsiteUpdate} />
					</div>
				)}
			</div>
		</section>
	);
}

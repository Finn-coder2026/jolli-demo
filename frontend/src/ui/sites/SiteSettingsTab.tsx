import { Button } from "../../components/ui/Button";
import { NativeSelect } from "../../components/ui/NativeSelect";
import { getDefaultSiteDomain, getVerifiedCustomDomain } from "../../util/UrlUtil";
import { CustomDomainManager } from "./CustomDomainManager";
import type { JwtAuthMode, SiteWithUpdate } from "jolli-common";
import { AlertTriangle, Globe, Info, KeyRound, Trash2 } from "lucide-react";
import { type ReactElement, useState } from "react";
import { useIntlayer } from "react-intlayer";

interface SiteSettingsTabProps {
	docsite: SiteWithUpdate;
	/** Callback when site is updated (e.g., custom domain changes) */
	onDocsiteUpdate: (site: SiteWithUpdate) => void;
	/** Whether JWT auth config is currently being saved */
	savingJwtAuth?: boolean;
	/** Callback to update JWT auth configuration */
	onJwtAuthUpdate?: (enabled: boolean, mode: JwtAuthMode) => void;
	/** Callback to trigger delete confirmation */
	onDeleteRequest?: () => void;
}

/**
 * Site Settings Tab - Auth settings, domain configuration, and danger zone.
 * Clean, organized settings inspired by Vercel/Netlify patterns.
 */
export function SiteSettingsTab({
	docsite,
	onDocsiteUpdate,
	savingJwtAuth,
	onJwtAuthUpdate,
	onDeleteRequest,
}: SiteSettingsTabProps): ReactElement {
	const content = useIntlayer("site-settings-tab");
	const [showDomainManager, setShowDomainManager] = useState(false);

	// Get current auth state
	const currentEnabled = docsite.metadata?.jwtAuth?.enabled ?? false;

	// Get domain info
	const verifiedCustomDomain = getVerifiedCustomDomain(docsite);
	const defaultDomain = getDefaultSiteDomain(docsite);

	return (
		<div className="space-y-8 max-w-3xl">
			{/* Authentication Section */}
			<section className="space-y-4" data-testid="auth-settings-section">
				<div className="flex items-center gap-2">
					<KeyRound className="h-5 w-5 text-muted-foreground" />
					<div>
						<h3 className="text-lg font-semibold">{content.authenticationTitle}</h3>
						<p className="text-sm text-muted-foreground">{content.authenticationDescription}</p>
					</div>
				</div>

				<div className="border rounded-lg p-4 space-y-4">
					{/* Enable Auth Toggle */}
					<div className="flex items-start gap-4">
						<div className="flex-1">
							<label
								htmlFor="enable-auth-toggle"
								className="text-sm font-medium flex items-center gap-2 cursor-pointer"
							>
								<input
									type="checkbox"
									id="enable-auth-toggle"
									checked={currentEnabled}
									onChange={e => onJwtAuthUpdate?.(e.target.checked, "full")}
									disabled={savingJwtAuth || docsite.status !== "active"}
									className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary focus:ring-offset-0"
									data-testid="enable-auth-checkbox"
								/>
								{content.enableAuthLabel}
							</label>
							<p className="text-xs text-muted-foreground mt-1 ml-6">{content.enableAuthDescription}</p>
						</div>
						{savingJwtAuth && (
							<span className="text-xs text-muted-foreground animate-pulse">{content.saving}</span>
						)}
					</div>

					{/* Auth Method (shown when enabled) */}
					{currentEnabled && (
						<div
							className="ml-6 mt-3 p-4 bg-muted/30 rounded-lg border space-y-4"
							data-testid="auth-method-section"
						>
							<div>
								<label className="block text-sm font-medium mb-2">{content.authMethodLabel}</label>
								<NativeSelect
									value="jolli"
									disabled={savingJwtAuth}
									className="w-full max-w-xs"
									data-testid="auth-method-select"
								>
									<option value="jolli">{content.authMethodJolli}</option>
								</NativeSelect>
								<p className="text-xs text-muted-foreground mt-2">
									{content.authMethodJolliDescription}
								</p>
							</div>

							{/* Login URL */}
							{docsite.metadata?.jwtAuth?.loginUrl && (
								<div>
									<label className="block text-xs text-muted-foreground mb-1">
										{content.loginUrl}
									</label>
									<code
										className="text-xs bg-muted p-2 rounded block break-all font-mono"
										data-testid="login-url"
									>
										{docsite.metadata.jwtAuth.loginUrl}
									</code>
								</div>
							)}
						</div>
					)}

					{/* Rebuild note - always visible when auth changes affect the site */}
					<div
						className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
						data-testid="auth-rebuild-note"
					>
						<Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
						<span className="text-xs text-amber-700 dark:text-amber-300">{content.authRebuildNote}</span>
					</div>
				</div>
			</section>

			{/* Custom Domain Section */}
			<section className="space-y-4" data-testid="domain-settings-section">
				<div className="flex items-center gap-2">
					<Globe className="h-5 w-5 text-muted-foreground" />
					<div>
						<h3 className="text-lg font-semibold">{content.domainTitle}</h3>
						<p className="text-sm text-muted-foreground">{content.domainDescription}</p>
					</div>
				</div>

				<div className="border rounded-lg p-4 space-y-4">
					{/* Current Domain */}
					<div className="flex items-center justify-between">
						<div>
							<div className="text-sm font-medium">
								{verifiedCustomDomain ? content.currentDomain : content.defaultDomain}
							</div>
							<div className="text-sm text-muted-foreground font-mono">
								{verifiedCustomDomain || defaultDomain || "—"}
							</div>
						</div>
						{docsite.status === "active" && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => setShowDomainManager(!showDomainManager)}
								data-testid="toggle-domain-manager"
							>
								{showDomainManager
									? content.hideDomainManager
									: verifiedCustomDomain
										? content.manageDomain
										: content.addDomain}
							</Button>
						)}
					</div>

					{/* Domain Manager (expanded) */}
					{showDomainManager && docsite.status === "active" && (
						<div className="pt-4 border-t" data-testid="domain-manager-expanded">
							<CustomDomainManager site={docsite} onUpdate={onDocsiteUpdate} />
						</div>
					)}
				</div>
			</section>

			{/* Danger Zone */}
			{onDeleteRequest && (docsite.status === "active" || docsite.status === "error") && (
				<section className="space-y-4" data-testid="danger-zone-section">
					<div className="flex items-center gap-2 text-destructive">
						<AlertTriangle className="h-5 w-5" />
						<h3 className="text-lg font-semibold">{content.dangerZoneTitle}</h3>
					</div>

					<div className="border border-destructive/30 rounded-lg p-4 bg-destructive/5">
						<div className="flex items-start justify-between gap-4">
							<div className="flex-1">
								<div className="text-sm font-medium">{content.deleteSiteButton}</div>
								<p className="text-xs text-muted-foreground mt-1">{content.deleteSiteDescription}</p>
							</div>
							<Button
								variant="destructive"
								size="sm"
								onClick={onDeleteRequest}
								data-testid="delete-site-button"
							>
								<Trash2 className="h-4 w-4 mr-2" />
								{content.deleteSiteButton}
							</Button>
						</div>
					</div>
				</section>
			)}
		</div>
	);
}

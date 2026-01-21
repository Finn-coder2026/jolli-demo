import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { NativeSelect } from "../../components/ui/NativeSelect";
import { useClient } from "../../contexts/ClientContext";
import { useOrg } from "../../contexts/OrgContext";
import { getLog } from "../../util/Logger";
import { ArticlePicker } from "./ArticlePicker";
import { SubdomainInput, validateSubdomain } from "./SubdomainInput";
import type { Doc, SessionConfig } from "jolli-common";
import { AlertCircle, ArrowLeft, ArrowRight, Check, FileText, Globe, Lock, Settings, X } from "lucide-react";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

interface CreateSiteDialogProps {
	onClose: (created: boolean) => void;
	onSuccess: (id: number) => void;
}

// Helper function to stop event propagation (exported for testing)
export function handleStopPropagation(e: React.MouseEvent): void {
	e.stopPropagation();
}

// Helper function to sanitize site name input (exported for testing)
export function sanitizeSiteName(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9-]/g, "");
}

// Helper function to extract display name from event (exported for testing)
export function extractDisplayName(e: React.ChangeEvent<HTMLInputElement>): string {
	return e.target.value;
}

// Validation helper (exported for testing)
export function validateSiteForm(data: {
	name: string;
	displayName: string;
	visibility: "internal" | "external";
	allowedDomain?: string;
	subdomain?: string;
}): {
	isValid: boolean;
	error?: string;
} {
	if (!data.name || data.name.trim() === "") {
		return { isValid: false, error: "Site name is required" };
	}
	if (!data.displayName || data.displayName.trim() === "") {
		return { isValid: false, error: "Display name is required" };
	}
	if (data.name.length < 3) {
		return { isValid: false, error: "Site name must be at least 3 characters" };
	}
	if (!/^[a-z0-9-]+$/.test(data.name)) {
		return { isValid: false, error: "Site name can only contain lowercase letters, numbers, and hyphens" };
	}
	// Subdomain validation (if provided) - delegates to shared validation function
	if (data.subdomain) {
		const subdomainValidation = validateSubdomain(data.subdomain);
		if (!subdomainValidation.valid) {
			// Map error codes to user-friendly messages
			const errorMessages: Record<string, string> = {
				tooShort: "Subdomain must be at least 3 characters",
				tooLong: "Subdomain must be 63 characters or less",
				consecutiveHyphens: "Subdomain cannot contain consecutive hyphens",
				invalidFormat:
					"Subdomain can only contain lowercase letters, numbers, and hyphens (no leading/trailing hyphens)",
			};
			return {
				isValid: false,
				error: errorMessages[subdomainValidation.error || ""] || "Invalid subdomain format",
			};
		}
	}
	if (data.visibility === "internal") {
		if (!data.allowedDomain || data.allowedDomain.trim() === "") {
			return { isValid: false, error: "Allowed domain is required for internal sites" };
		}
		if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(data.allowedDomain)) {
			return { isValid: false, error: "Please enter a valid domain (e.g., jolli.ai)" };
		}
	}
	return { isValid: true };
}

// Format error message helper (exported for testing)
export function formatCreationError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "Failed to create docsite. Please try again.";
}

/** Default base domain for jolli.site subdomains */
const JOLLI_SITE_BASE_DOMAIN = "jolli.site";

type Step = "basics" | "articles" | "options";

const STEPS: Array<Step> = ["basics", "articles", "options"];

export function CreateSiteDialog({ onClose, onSuccess }: CreateSiteDialogProps): ReactElement {
	const content = useIntlayer("create-site-dialog");
	const client = useClient();
	const { tenant } = useOrg();
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState<string | undefined>();
	const [articles, setArticles] = useState<Array<Doc>>([]);
	const [loadingArticles, setLoadingArticles] = useState(true);

	const [currentStep, setCurrentStep] = useState<Step>("basics");
	const [name, setName] = useState("");
	const [displayName, setDisplayName] = useState("");
	const [subdomain, setSubdomain] = useState("");
	// These state variables are used in API calls but have no UI controls yet.
	// The setters are prefixed with _ to suppress unused variable warnings.
	const [visibility, _setVisibility] = useState<"internal" | "external">("external");
	const [allowedDomain, _setAllowedDomain] = useState("");
	const [_siteType, _setSiteType] = useState<"document" | "wiki">("document");
	const [framework, _setFramework] = useState<"docusaurus-2" | "nextra">("nextra");
	const [jwtAuthEnabled, setJwtAuthEnabled] = useState(false);

	// Inline validation error for site name
	const [siteNameError, setSiteNameError] = useState<string | undefined>();

	// Article selection state
	const [includeAllArticles, setIncludeAllArticles] = useState(true);
	const [selectedArticleJrns, setSelectedArticleJrns] = useState<Set<string>>(new Set());

	// Session config for site environment settings
	const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);

	// Compute tenant-aware domain suffix with environment subdomain
	// Format: -{tenant}.{siteEnv}.{baseDomain} for non-prod, -{tenant}.{baseDomain} for prod
	const domainSuffix = useMemo(() => {
		const baseDomain = sessionConfig?.jolliSiteDomain ?? JOLLI_SITE_BASE_DOMAIN;
		const siteEnv = sessionConfig?.siteEnv;
		// Build env subdomain: ".local" or ".dev" or ".preview" or "" for prod
		const envSubdomain = siteEnv && siteEnv !== "prod" ? `.${siteEnv}` : "";

		if (tenant?.slug) {
			return `-${tenant.slug}${envSubdomain}.${baseDomain}`;
		}
		// Single-tenant mode: use simple suffix (backend will use hostname as tenant slug)
		return `${envSubdomain}.${baseDomain}`;
	}, [tenant?.slug, sessionConfig]);

	// Step index for progress indicator
	const currentStepIndex = STEPS.indexOf(currentStep);

	// Validate basics step fields including subdomain
	function validateBasicsStep(): { isValid: boolean; error?: string } {
		if (name.length < 3) {
			return { isValid: false, error: content.errorNameTooShort as string };
		}
		if (displayName.length === 0) {
			return { isValid: false, error: content.errorDisplayNameRequired as string };
		}
		// Validate subdomain if provided - uses shared validation function
		if (subdomain) {
			// Check for invalid characters first (more specific error message)
			if (!/^[a-z0-9-]*$/.test(subdomain)) {
				return { isValid: false, error: content.errorSubdomainInvalidChars as string };
			}
			const subdomainValidation = validateSubdomain(subdomain);
			if (!subdomainValidation.valid) {
				// Map error codes to localized messages
				const errorMessages: Record<string, string> = {
					tooShort: content.errorSubdomainTooShort as string,
					tooLong: content.errorSubdomainTooLong as string,
					consecutiveHyphens: content.errorSubdomainInvalidFormat as string,
					invalidFormat: content.errorSubdomainInvalidFormat as string,
				};
				return {
					isValid: false,
					error:
						errorMessages[subdomainValidation.error || ""] ||
						(content.errorSubdomainInvalidFormat as string),
				};
			}
		}
		return { isValid: true };
	}

	// Check if current step is valid for navigation (used for button disabled state)
	function isStepValid(step: Step): boolean {
		switch (step) {
			case "basics":
				// Basic check for button enable/disable - full validation on Next click
				// Also validate subdomain to prevent progression with invalid values
				return name.length >= 3 && displayName.length > 0 && validateSubdomain(subdomain).valid;
			case "articles":
				return true; // Articles are optional
			case "options":
				return true;
			default:
				return false;
		}
	}

	// Define event handlers as named functions
	function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
		const sanitized = sanitizeSiteName(e.target.value);
		setName(sanitized);
		setError(undefined);
		// Inline validation for site name length
		if (sanitized.length > 0 && sanitized.length < 3) {
			setSiteNameError(content.errorNameTooShort as string);
		} else {
			setSiteNameError(undefined);
		}
	}

	function handleDisplayNameChange(e: React.ChangeEvent<HTMLInputElement>) {
		setDisplayName(extractDisplayName(e));
		setError(undefined);
	}

	function handleAuthCheckboxChange(e: React.ChangeEvent<HTMLInputElement>) {
		setJwtAuthEnabled(e.target.checked);
	}

	function handleSubdomainChange(value: string) {
		setSubdomain(value);
	}

	function handleCancel() {
		onClose(false);
	}

	function handleBack() {
		const idx = STEPS.indexOf(currentStep);
		if (idx > 0) {
			setCurrentStep(STEPS[idx - 1]);
			setError(undefined);
		}
	}

	function handleNext() {
		// Validate current step before proceeding
		if (currentStep === "basics") {
			const validation = validateBasicsStep();
			if (!validation.isValid) {
				setError(validation.error);
				return;
			}
		} else if (!isStepValid(currentStep)) {
			return;
		}
		const idx = STEPS.indexOf(currentStep);
		if (idx < STEPS.length - 1) {
			setCurrentStep(STEPS[idx + 1]);
			setError(undefined);
		}
	}

	// Fetch session config on mount for site environment settings
	useEffect(() => {
		async function fetchSessionConfig() {
			try {
				const config = await client.auth().getSessionConfig();
				setSessionConfig(config);
			} catch (error) {
				log.error(error, "Failed to fetch session config, using defaults");
			}
		}
		fetchSessionConfig().then();
	}, [client]);

	// Fetch articles on mount
	function initializeArticles() {
		fetchArticles().then();
	}

	useEffect(initializeArticles, []);

	async function fetchArticles() {
		try {
			const docs = await client.docs().listDocs();
			setArticles(docs);
		} catch (error) {
			log.error(error, "Failed to fetch articles.");
			setError(content.errorLoadingArticles as string);
		} finally {
			setLoadingArticles(false);
		}
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(undefined);

		// Validate form data
		const validationResult = validateSiteForm({
			name,
			displayName,
			visibility,
			allowedDomain,
			subdomain,
		});

		if (!validationResult.isValid) {
			setError(validationResult.error);
			return;
		}

		// Zero articles is allowed - will create a placeholder site
		// (removed validation that required at least one article)

		setCreating(true);
		try {
			const requestData: {
				name: string;
				displayName: string;
				visibility: "internal" | "external";
				framework: "docusaurus-2" | "nextra";
				selectedArticleJrns?: Array<string>;
				subdomain?: string;
				jwtAuth?: { enabled: boolean; mode: "full" };
			} = {
				name,
				displayName,
				visibility,
				framework,
			};

			// Only include selectedArticleJrns if not including all
			if (!includeAllArticles) {
				requestData.selectedArticleJrns = [...selectedArticleJrns];
			}

			if (subdomain) {
				requestData.subdomain = subdomain;
			}

			// Include JWT auth config if enabled
			if (jwtAuthEnabled) {
				requestData.jwtAuth = { enabled: true, mode: "full" };
			}

			const result = await client.sites().createSite(requestData);
			onSuccess(result.id);
		} catch (error) {
			log.error(error, "Failed to create docsite.");
			setError(formatCreationError(error));
			setCreating(false);
		}
	}

	// Render step content
	function renderStepContent() {
		switch (currentStep) {
			case "basics":
				return (
					<div className="space-y-4">
						<div>
							<label className="block text-sm font-medium mb-1.5">
								{content.displayNameLabel} <span className="text-red-500">*</span>
							</label>
							<Input
								value={displayName}
								onChange={handleDisplayNameChange}
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
								onChange={handleNameChange}
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
							onChange={handleSubdomainChange}
							siteName={name}
							disabled={creating}
							domainSuffix={domainSuffix}
						/>
					</div>
				);

			case "articles":
				return (
					<div className="space-y-4">
						<div className="flex items-center gap-2 text-muted-foreground">
							<FileText className="h-4 w-4" />
							<span className="text-sm">{content.articlesInfoDescription}</span>
						</div>

						{loadingArticles ? (
							<div className="py-8 text-center text-muted-foreground" data-testid="loading-articles">
								{content.loadingArticles}
							</div>
						) : articles.length === 0 ? (
							<div
								className="py-8 text-center text-amber-600 dark:text-amber-400"
								data-testid="no-articles"
							>
								{content.noArticlesAvailable}
							</div>
						) : (
							<ArticlePicker
								articles={articles}
								selectedJrns={selectedArticleJrns}
								onSelectionChange={setSelectedArticleJrns}
								includeAll={includeAllArticles}
								onIncludeAllChange={setIncludeAllArticles}
								disabled={creating}
							/>
						)}
					</div>
				);

			case "options":
				return (
					<div className="space-y-4">
						{/* Authentication Section */}
						<div className="border rounded-lg p-4 space-y-3">
							<div className="flex items-center gap-2">
								<Lock className="h-4 w-4 text-muted-foreground" />
								<span className="text-sm font-medium">{content.enableAuthLabel}</span>
							</div>
							<label className="flex items-start gap-3 cursor-pointer" htmlFor="enable-auth-checkbox">
								<input
									type="checkbox"
									id="enable-auth-checkbox"
									checked={jwtAuthEnabled}
									onChange={handleAuthCheckboxChange}
									disabled={creating}
									className="h-4 w-4 mt-0.5 rounded border-gray-300 text-primary focus:ring-primary"
									data-testid="enable-auth-checkbox"
								/>
								<div>
									<span className="text-sm">{content.authMethodJolli}</span>
									<p className="text-xs text-muted-foreground mt-0.5">
										{content.authMethodJolliDescription}
									</p>
								</div>
							</label>
						</div>

						{/* Expanded Auth Method Section - shown when auth is enabled */}
						{jwtAuthEnabled && (
							<div
								className="ml-4 p-3 bg-muted/30 rounded-md border border-border"
								data-testid="auth-method-section"
							>
								<label className="block text-sm font-medium mb-1">{content.authMethodLabel}</label>
								<NativeSelect value="jolli" disabled={creating} data-testid="auth-method-select">
									<option value="jolli">{content.authMethodJolli}</option>
								</NativeSelect>
							</div>
						)}
					</div>
				);

			default:
				return null;
		}
	}

	// Step titles for the progress indicator
	function getStepTitle(step: Step): React.ReactNode {
		switch (step) {
			case "basics":
				return content.siteNameLabel;
			case "articles":
				return content.articlesInfoTitle;
			case "options":
				return content.settingsLabel;
			default:
				return "";
		}
	}

	// Step icons
	function getStepIcon(step: Step) {
		switch (step) {
			case "basics":
				return Globe;
			case "articles":
				return FileText;
			case "options":
				return Settings;
			default:
				return Globe;
		}
	}

	const isLastStep = currentStep === "options";
	const isFirstStep = currentStep === "basics";

	return (
		<div
			className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
			onClick={handleCancel}
			data-testid="create-site-dialog-backdrop"
		>
			<div
				className="bg-background border border-border rounded-xl shadow-xl w-full max-w-lg m-4 max-h-[90vh] flex flex-col overflow-hidden"
				onClick={handleStopPropagation}
				data-testid="create-site-dialog-content"
			>
				{/* Header */}
				<div className="flex items-center justify-between px-6 py-4 border-b">
					<h2 className="text-lg font-semibold">{content.title}</h2>
					<Button variant="ghost" size="icon" onClick={handleCancel} data-testid="close-dialog-button">
						<X className="h-5 w-5" />
					</Button>
				</div>

				{/* Progress indicator */}
				<div className="px-6 py-4 border-b bg-muted/30">
					<div className="flex items-center" data-testid="step-progress">
						{STEPS.map((step, idx) => {
							const StepIcon = getStepIcon(step);
							const isCompleted = idx < currentStepIndex;
							const isCurrent = step === currentStep;

							return (
								<div key={step} className="flex items-center flex-1 last:flex-none">
									<div className="flex flex-col items-center w-20">
										<div
											className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
												isCompleted
													? "bg-primary text-primary-foreground"
													: isCurrent
														? "bg-primary/10 text-primary border-2 border-primary"
														: "bg-muted text-muted-foreground"
											}`}
										>
											{isCompleted ? (
												<Check className="h-4 w-4" />
											) : (
												<StepIcon className="h-4 w-4" />
											)}
										</div>
										<span
											className={`text-xs mt-1 text-center ${
												isCurrent ? "text-foreground font-medium" : "text-muted-foreground"
											}`}
										>
											{getStepTitle(step)}
										</span>
									</div>
									{idx < STEPS.length - 1 && (
										<div
											className={`flex-1 h-0.5 -mx-2 mt-[-1rem] ${
												isCompleted ? "bg-primary" : "bg-border"
											}`}
										/>
									)}
								</div>
							);
						})}
					</div>
				</div>

				{/* Content */}
				<form role="form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
					{error && (
						<div
							className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm mb-4"
							data-testid="error-message"
						>
							{error}
						</div>
					)}

					{renderStepContent()}

					{creating && (
						<div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mt-4">
							<div className="flex items-start gap-2">
								<AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
								<div className="flex-1">
									<p
										className="text-sm text-amber-700 dark:text-amber-400"
										data-testid="creating-message"
									>
										{content.creatingMessage}
									</p>
								</div>
							</div>
						</div>
					)}
				</form>

				{/* Footer */}
				<div className="flex items-center justify-between px-6 py-4 border-t bg-muted/30">
					<div>
						{!isFirstStep && (
							<Button
								type="button"
								variant="ghost"
								onClick={handleBack}
								disabled={creating}
								data-testid="back-button"
							>
								<ArrowLeft className="h-4 w-4 mr-2" />
								{content.backButton}
							</Button>
						)}
					</div>
					<div className="flex items-center gap-2">
						{isFirstStep && (
							<Button
								type="button"
								variant="outline"
								onClick={handleCancel}
								disabled={creating}
								data-testid="cancel-button"
							>
								{content.cancelButton}
							</Button>
						)}
						{isLastStep ? (
							<Button
								type="submit"
								onClick={handleSubmit}
								disabled={creating || articles.length === 0}
								data-testid="submit-button"
							>
								{creating ? content.creatingButton : content.createButton}
							</Button>
						) : (
							<Button
								type="button"
								onClick={handleNext}
								disabled={creating || !isStepValid(currentStep)}
								data-testid="next-button"
							>
								{content.nextButton}
								<ArrowRight className="h-4 w-4 ml-2" />
							</Button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

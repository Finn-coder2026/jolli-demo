import { Button } from "../../components/ui/Button";
import { useClient } from "../../contexts/ClientContext";
import { useOrg } from "../../contexts/OrgContext";
import { usePreference } from "../../hooks/usePreference";
import { PREFERENCES } from "../../services/preferences/PreferencesRegistry";
import { getLog } from "../../util/Logger";
import { validateSubdomain } from "./SubdomainInput";
import { WizardAccessStep } from "./wizard/WizardAccessStep";
import { WizardBasicsStep } from "./wizard/WizardBasicsStep";
import { WizardBrandingStep } from "./wizard/WizardBrandingStep";
import { WizardContentStep } from "./wizard/WizardContentStep";
import type { Doc, SessionConfig, SiteBranding, Space, ThemePreset } from "jolli-common";
import { applyPreset } from "jolli-common";
import { AlertCircle, ArrowLeft, ArrowRight, Check, FileText, Globe, Loader2, Lock, Palette, X } from "lucide-react";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

interface CreateSiteWizardProps {
	onClose: () => void;
	onSuccess: (id: number) => void;
}

type Step = "basics" | "content" | "branding" | "access";

const STEPS: Array<Step> = ["basics", "content", "branding", "access"];

const JOLLI_SITE_BASE_DOMAIN = "jolli.site";

function sanitizeSiteName(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9-]/g, "");
}

function getStepIcon(step: Step) {
	switch (step) {
		case "basics":
			return Globe;
		case "content":
			return FileText;
		case "branding":
			return Palette;
		case "access":
			return Lock;
		default: {
			const _exhaustive: never = step;
			return _exhaustive;
		}
	}
}

export function CreateSiteWizard({ onClose, onSuccess }: CreateSiteWizardProps): ReactElement {
	const content = useIntlayer("create-site-wizard");
	const brandingContent = useIntlayer("site-branding-tab");
	const client = useClient();
	const { tenant } = useOrg();
	const [savedThemePreset, setSavedThemePreset] = usePreference(PREFERENCES.wizardThemePreset);
	const [savedJwtAuth, setSavedJwtAuth] = usePreference(PREFERENCES.wizardJwtAuthEnabled);

	const [currentStep, setCurrentStep] = useState<Step>("basics");
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState<string | undefined>();

	const [name, setName] = useState("");
	const [displayName, setDisplayName] = useState("");
	const [subdomain, setSubdomain] = useState("");
	const [siteNameError, setSiteNameError] = useState<string | undefined>();

	const [articles, setArticles] = useState<Array<Doc>>([]);
	const [spaces, setSpaces] = useState<Array<Space>>([]);
	const [loadingArticles, setLoadingArticles] = useState(true);
	const [includeAllArticles, setIncludeAllArticles] = useState(false);
	const [selectedArticleJrns, setSelectedArticleJrns] = useState<Set<string>>(new Set());
	const [useSpaceFolderStructure, setUseSpaceFolderStructure] = useState(true);

	const [branding, setBranding] = useState<Partial<SiteBranding>>(() => {
		const preset = savedThemePreset ?? "minimal";
		return applyPreset(preset);
	});
	const usedRememberedPreset = savedThemePreset !== null;

	const [jwtAuthEnabled, setJwtAuthEnabled] = useState(() => savedJwtAuth ?? true);
	const usedRememberedAccess = savedJwtAuth !== null;

	const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);

	const domainSuffix = useMemo(() => {
		const baseDomain = sessionConfig?.jolliSiteDomain ?? JOLLI_SITE_BASE_DOMAIN;
		const siteEnv = sessionConfig?.siteEnv;
		const envSubdomain = siteEnv && siteEnv !== "prod" ? `.${siteEnv}` : "";

		if (tenant?.slug) {
			return `-${tenant.slug}${envSubdomain}.${baseDomain}`;
		}
		return `${envSubdomain}.${baseDomain}`;
	}, [tenant?.slug, sessionConfig]);

	const currentStepIndex = STEPS.indexOf(currentStep);

	useEffect(() => {
		async function fetchSessionConfig() {
			try {
				const config = await client.auth().getSessionConfig();
				setSessionConfig(config);
			} catch (err) {
				log.error(err, "Failed to fetch session config");
			}
		}
		void fetchSessionConfig();
	}, [client]);

	useEffect(() => {
		async function fetchArticlesAndSpaces() {
			try {
				const [docs, spacesList] = await Promise.all([client.docs().listDocs(), client.spaces().listSpaces()]);
				setArticles(docs);
				setSpaces(spacesList);
			} catch (err) {
				log.error(err, "Failed to fetch articles or spaces");
				setError(content.errorLoadingArticles.value);
			} finally {
				setLoadingArticles(false);
			}
		}
		void fetchArticlesAndSpaces();
	}, [client, content.errorLoadingArticles]);

	function validateBasicsStep(): { isValid: boolean; error?: string } {
		if (name.length < 3) {
			return { isValid: false, error: content.errorNameTooShort.value };
		}
		if (displayName.length === 0) {
			return { isValid: false, error: content.errorDisplayNameRequired.value };
		}
		if (subdomain) {
			if (!/^[a-z0-9-]*$/.test(subdomain)) {
				return { isValid: false, error: content.errorSubdomainInvalidChars.value };
			}
			const subdomainValidation = validateSubdomain(subdomain);
			if (!subdomainValidation.valid) {
				return { isValid: false, error: content.errorSubdomainInvalid.value };
			}
		}
		return { isValid: true };
	}

	function isStepValid(step: Step): boolean {
		switch (step) {
			case "basics":
				return name.length >= 3 && displayName.length > 0 && validateSubdomain(subdomain).valid;
			case "content":
				return includeAllArticles || selectedArticleJrns.size > 0;
			case "branding":
				return true;
			case "access":
				return true;
			default: {
				const _exhaustive: never = step;
				return _exhaustive;
			}
		}
	}

	function isFormComplete(): boolean {
		return STEPS.every(step => isStepValid(step));
	}

	function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
		const sanitized = sanitizeSiteName(e.target.value);
		setName(sanitized);
		setError(undefined);
		if (sanitized.length > 0 && sanitized.length < 3) {
			setSiteNameError(content.errorNameTooShort.value);
		} else {
			setSiteNameError(undefined);
		}
	}

	function handleDisplayNameChange(e: React.ChangeEvent<HTMLInputElement>) {
		setDisplayName(e.target.value);
		setError(undefined);
	}

	function goToNextStep() {
		if (currentStepIndex < STEPS.length - 1) {
			setCurrentStep(STEPS[currentStepIndex + 1]);
			setError(undefined);
		}
	}

	function handleBack() {
		if (currentStepIndex > 0) {
			setCurrentStep(STEPS[currentStepIndex - 1]);
			setError(undefined);
		}
	}

	function handleNext() {
		if (currentStep === "basics") {
			const validation = validateBasicsStep();
			if (!validation.isValid) {
				setError(validation.error);
				return;
			}
		}
		goToNextStep();
	}

	function handlePresetSelect(preset: Exclude<ThemePreset, "custom">) {
		const presetValues = applyPreset(preset);
		setBranding(presetValues);
		setSavedThemePreset(preset);
	}

	function handleJwtAuthChange(enabled: boolean) {
		setJwtAuthEnabled(enabled);
		setSavedJwtAuth(enabled);
	}

	function handleSkip() {
		// If skipping content step without selecting articles, default to include all
		if (currentStep === "content" && !includeAllArticles && selectedArticleJrns.size === 0) {
			setIncludeAllArticles(true);
		}
		goToNextStep();
	}

	async function handleSubmit() {
		if (creating) {
			return;
		}
		setError(undefined);
		setCreating(true);

		try {
			const requestData: {
				name: string;
				displayName: string;
				visibility: "internal" | "external";
				framework: "nextra";
				selectedArticleJrns?: Array<string>;
				subdomain?: string;
				jwtAuth?: { enabled: boolean; mode: "full" };
				branding?: Partial<SiteBranding>;
				useSpaceFolderStructure?: boolean;
			} = {
				name,
				displayName,
				visibility: jwtAuthEnabled ? "internal" : "external",
				framework: "nextra",
			};

			if (!includeAllArticles) {
				requestData.selectedArticleJrns = [...selectedArticleJrns];
			}

			if (subdomain) {
				requestData.subdomain = subdomain;
			}

			if (jwtAuthEnabled) {
				requestData.jwtAuth = { enabled: true, mode: "full" };
			}

			// Include branding if user customized anything
			if (
				branding.themePreset !== "minimal" ||
				branding.logo ||
				branding.logoUrl ||
				branding.favicon ||
				branding.logoDisplay
			) {
				requestData.branding = branding;
			}

			requestData.useSpaceFolderStructure = useSpaceFolderStructure;

			const result = await client.sites().createSite(requestData);
			onSuccess(result.id);
		} catch (err) {
			log.error(err, "Failed to create site");
			setError(err instanceof Error ? err.message : content.errorCreatingFailed.value);
			setCreating(false);
		}
	}

	function getStepTitle(step: Step): string {
		switch (step) {
			case "basics":
				return content.stepBasics.value;
			case "content":
				return content.stepContent.value;
			case "branding":
				return content.stepBranding.value;
			case "access":
				return content.stepAccess.value;
			default: {
				const _exhaustive: never = step;
				return _exhaustive;
			}
		}
	}

	function renderStepContent(): ReactElement | null {
		switch (currentStep) {
			case "basics":
				return (
					<WizardBasicsStep
						name={name}
						displayName={displayName}
						subdomain={subdomain}
						siteNameError={siteNameError}
						domainSuffix={domainSuffix}
						creating={creating}
						content={content}
						onNameChange={handleNameChange}
						onDisplayNameChange={handleDisplayNameChange}
						onSubdomainChange={setSubdomain}
					/>
				);
			case "content":
				return (
					<WizardContentStep
						articles={articles}
						spaces={spaces}
						loadingArticles={loadingArticles}
						selectedArticleJrns={selectedArticleJrns}
						includeAllArticles={includeAllArticles}
						useSpaceFolderStructure={useSpaceFolderStructure}
						creating={creating}
						content={content}
						onSelectionChange={setSelectedArticleJrns}
						onIncludeAllChange={setIncludeAllArticles}
						onToggleFolderStructure={() => setUseSpaceFolderStructure(prev => !prev)}
					/>
				);
			case "branding":
				return (
					<WizardBrandingStep
						branding={branding}
						displayName={displayName}
						usedRememberedPreset={usedRememberedPreset}
						creating={creating}
						content={content}
						brandingContent={brandingContent}
						onBrandingChange={setBranding}
						onPresetSelect={handlePresetSelect}
					/>
				);
			case "access":
				return (
					<WizardAccessStep
						jwtAuthEnabled={jwtAuthEnabled}
						usedRememberedAccess={usedRememberedAccess}
						creating={creating}
						content={content}
						onJwtAuthChange={handleJwtAuthChange}
					/>
				);
			default: {
				const _exhaustive: never = currentStep;
				return _exhaustive;
			}
		}
	}

	const isLastStep = currentStep === "access";
	const isFirstStep = currentStep === "basics";

	return (
		<div className="h-full flex overflow-hidden bg-sidebar p-1.5 gap-1.5" data-testid="create-site-wizard">
			<div className="shrink-0 h-full w-60 flex flex-col bg-background rounded-lg border border-border shadow-sm">
				<div className="h-12 px-4 flex items-center gap-2 flex-shrink-0">
					<button
						type="button"
						onClick={onClose}
						className="p-1.5 -ml-1.5 rounded-md hover:bg-muted transition-colors"
						data-testid="close-wizard"
					>
						<X className="h-5 w-5" />
					</button>
					<h1 className="text-sm font-semibold truncate">{content.title}</h1>
				</div>

				<nav className="flex-1 px-2 py-3 space-y-1" data-testid="step-indicators">
					{STEPS.map((step, idx) => {
						const StepIcon = getStepIcon(step);
						const isCompleted = idx < currentStepIndex;
						const isCurrent = step === currentStep;

						return (
							<button
								key={step}
								type="button"
								onClick={() => {
									if (isCompleted || isCurrent) {
										setCurrentStep(step);
									}
								}}
								disabled={!isCompleted && !isCurrent}
								className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
									isCurrent
										? "bg-primary/10 text-foreground font-medium border-l-2 border-primary"
										: isCompleted
											? "text-foreground hover:bg-muted cursor-pointer"
											: "text-muted-foreground cursor-not-allowed"
								}`}
								data-testid={`step-${step}`}
							>
								<div
									className={`h-6 w-6 rounded-full flex items-center justify-center text-xs ${
										isCompleted
											? "bg-primary text-primary-foreground"
											: isCurrent
												? "bg-primary/20 text-primary"
												: "bg-muted text-muted-foreground"
									}`}
								>
									{isCompleted ? (
										<Check className="h-3.5 w-3.5" />
									) : (
										<StepIcon className="h-3.5 w-3.5" />
									)}
								</div>
								<span>{getStepTitle(step)}</span>
							</button>
						);
					})}
				</nav>

				<div className="h-12 px-3 flex items-center flex-shrink-0">
					{isFirstStep ? (
						<Button
							variant="ghost"
							onClick={onClose}
							disabled={creating}
							className="w-full justify-start"
							data-testid="cancel-button"
						>
							<X className="h-4 w-4 mr-2" />
							{content.cancelButton}
						</Button>
					) : (
						<Button
							variant="ghost"
							onClick={handleBack}
							disabled={creating}
							className="w-full justify-start"
							data-testid="back-button"
						>
							<ArrowLeft className="h-4 w-4 mr-2" />
							{content.backButton}
						</Button>
					)}
				</div>
			</div>

			<div className="flex-1 flex flex-col overflow-hidden bg-background rounded-lg border border-border shadow-sm">
				<header className="h-12 flex items-center justify-between px-4 flex-shrink-0">
					<h2 className="text-sm font-semibold">{getStepTitle(currentStep)}</h2>
					<div className="text-xs text-muted-foreground">
						{currentStepIndex + 1} / {STEPS.length}
					</div>
				</header>

				<main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
					{error && (
						<div
							className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm mb-6 max-w-lg"
							data-testid="error-message"
						>
							<div className="flex items-center gap-2">
								<AlertCircle className="h-4 w-4 flex-shrink-0" />
								{error}
							</div>
						</div>
					)}

					{renderStepContent()}

					{creating && (
						<div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mt-6 max-w-lg">
							<div className="flex items-center gap-3">
								<Loader2 className="h-5 w-5 text-blue-500 animate-spin flex-shrink-0" />
								<div>
									<p className="text-sm font-medium text-blue-600 dark:text-blue-400">
										{content.creatingTitle}
									</p>
									<p className="text-xs text-blue-600/70 dark:text-blue-400/70">
										{content.creatingDescription}
									</p>
								</div>
							</div>
						</div>
					)}
				</main>

				<footer className="h-12 flex items-center justify-end gap-2 px-4 flex-shrink-0 bg-muted/30">
					{isLastStep ? (
						<Button
							onClick={handleSubmit}
							disabled={creating || !isFormComplete()}
							data-testid="create-button"
						>
							{creating ? (
								<>
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									{content.creatingButton}
								</>
							) : (
								content.createButton
							)}
						</Button>
					) : (
						<>
							{(currentStep === "content" || currentStep === "branding") && (
								<Button
									variant="ghost"
									onClick={handleSkip}
									disabled={creating}
									data-testid="skip-button"
								>
									{content.skipButton}
								</Button>
							)}
							<Button
								onClick={handleNext}
								disabled={creating || !isStepValid(currentStep)}
								data-testid="next-button"
							>
								{content.nextButton}
								<ArrowRight className="h-4 w-4 ml-2" />
							</Button>
						</>
					)}
				</footer>
			</div>
		</div>
	);
}

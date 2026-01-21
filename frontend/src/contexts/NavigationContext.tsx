import type { Tab } from "../types/Tab";
import { useClient } from "./ClientContext";
import { useDevTools } from "./DevToolsContext";
import { useLocation, useNavigate, useOpen, useRedirect } from "./RouterContext";
import type { UserInfo } from "jolli-common";
// import { BarChart3, FileText, Gauge, Globe, Plug, Settings } from "lucide-react";
// import { createContext, type ReactElement, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

// const TAB_NAMES = ["dashboard", "articles", "docsites", "analytics", "integrations", "settings"] as const;
import { BarChart3, FileText, Gauge, Globe, Plug, Settings, Wrench } from "lucide-react";
import { createContext, type ReactElement, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { useIntlayer } from "react-intlayer";

const TAB_NAMES = ["dashboard", "articles", "sites", "analytics", "integrations", "settings", "devtools"] as const;

export type TabName = (typeof TAB_NAMES)[number];

export type ArticleView = "list" | "detail" | "preview" | "source" | "none";
export type SiteView = "list" | "detail" | "none";
export type IntegrationView =
	| "main"
	| "github"
	| "github-apps"
	| "github-org-repos"
	| "github-user-repos"
	| "static-file"
	| "none";
export type DraftView = "list" | "edit" | "none";

interface Navigation {
	tabs: Array<Tab<TabName>>;
	activeTab: TabName;
	articleView: ArticleView;
	articleJrn: string | undefined;
	integrationView: IntegrationView;
	integrationContainer: string | undefined;
	integrationContainerType: "org" | "user" | undefined;
	staticFileIntegrationId: number | undefined;
	draftView: DraftView;
	draftId: number | undefined;
	siteView: SiteView;
	siteId: number | undefined;
	navigate(pathname: string): void;
	open(pathname: string): void;
	hasIntegrations: boolean | undefined;
	githubSetupComplete: boolean;
	checkIntegrations(): void;
	refreshIntegrations(): void;
	integrationSetupComplete(): void;
}

const NavigationContext = createContext<Navigation | undefined>(undefined);

interface NavigationProviderProps {
	children: ReactNode;
	pathname?: string; // For testing
	userInfo?: UserInfo | undefined; // For integrations checking
}

function isTabName(name: string): name is TabName {
	return TAB_NAMES.includes(name as TabName);
}

function parseArticleRoute(
	pathSegments: Array<string>,
	getPathSegment: (index: number) => string | undefined,
): { articleView: ArticleView; articleJrn: string | undefined } {
	let articleView: ArticleView = "none";
	let articleJrn: string | undefined;

	if (pathSegments[0] === "articles") {
		const jrn = getPathSegment(1);
		if (!jrn) {
			articleView = "list";
		} else if (pathSegments[2] === "preview") {
			articleView = "preview";
			articleJrn = jrn;
		} else if (pathSegments[2] === "source") {
			articleView = "source";
			articleJrn = jrn;
		} else {
			articleView = "detail";
			articleJrn = jrn;
		}
	}

	return { articleView, articleJrn };
}

function parseIntegrationRoute(
	pathSegments: Array<string>,
	getPathSegment: (index: number) => string | undefined,
): {
	integrationView: IntegrationView;
	integrationContainer: string | undefined;
	integrationContainerType: "org" | "user" | undefined;
	staticFileIntegrationId: number | undefined;
} {
	let integrationView: IntegrationView = "none";
	let integrationContainer: string | undefined;
	let integrationContainerType: "org" | "user" | undefined;
	let staticFileIntegrationId: number | undefined;

	if (pathSegments[0] === "integrations") {
		const secondSegment = getPathSegment(1);
		if (!secondSegment) {
			integrationView = "main";
		} else if (secondSegment === "github") {
			const thirdSegment = getPathSegment(2);
			if (!thirdSegment) {
				integrationView = "github";
			} else if (thirdSegment === "org" || thirdSegment === "user") {
				integrationContainerType = thirdSegment;
				const fourthSegment = getPathSegment(3);
				if (fourthSegment) {
					integrationContainer = fourthSegment;
					integrationView = thirdSegment === "org" ? "github-org-repos" : "github-user-repos";
				}
			}
		} else if (secondSegment === "static-file") {
			const thirdSegment = getPathSegment(2);
			if (thirdSegment) {
				const id = Number.parseInt(thirdSegment, 10);
				if (!Number.isNaN(id)) {
					integrationView = "static-file";
					staticFileIntegrationId = id;
				}
			}
		}
	}

	return { integrationView, integrationContainer, integrationContainerType, staticFileIntegrationId };
}

function parseDraftRoute(
	pathSegments: Array<string>,
	getPathSegment: (index: number) => string | undefined,
): { draftView: DraftView; draftId: number | undefined } {
	let draftView: DraftView = "none";
	let draftId: number | undefined;

	if (pathSegments[0] === "draft-articles") {
		draftView = "list";
	} else if (pathSegments[0] === "article-draft") {
		const idSegment = getPathSegment(1);
		if (idSegment) {
			draftView = "edit";
			draftId = Number.parseInt(idSegment, 10);
		}
	}

	return { draftView, draftId };
}

function parseSiteRoute(
	pathSegments: Array<string>,
	getPathSegment: (index: number) => string | undefined,
): { siteView: SiteView; siteId: number | undefined } {
	let siteView: SiteView = "none";
	let siteId: number | undefined;

	if (pathSegments[0] === "sites") {
		const secondSegment = getPathSegment(1);
		if (!secondSegment) {
			siteView = "list";
		} else {
			siteView = "detail";
			siteId = Number.parseInt(secondSegment, 10);
		}
	}

	return { siteView, siteId };
}

export function NavigationProvider({ children, pathname, userInfo }: NavigationProviderProps): ReactElement {
	const location = useLocation();
	const navigate = useNavigate();
	const open = useOpen();
	const redirect = useRedirect();
	const client = useClient();
	const { devToolsEnabled } = useDevTools();
	const content = useIntlayer("app-layout");

	// Define tabs with localized labels
	const baseTabs: Array<Tab<TabName>> = [
		{ name: "dashboard", icon: Gauge, label: content.tabDashboard.value },
		{ name: "articles", icon: FileText, label: content.tabArticles.value },
		{ name: "sites", icon: Globe, label: content.tabSites.value },
		{ name: "analytics", icon: BarChart3, label: content.tabAnalytics.value },
		{ name: "integrations", icon: Plug, label: content.tabIntegrations.value },
		{ name: "settings", icon: Settings, label: content.tabSettings.value },
	];

	const devToolsTab: Tab<TabName> = { name: "devtools", icon: Wrench, label: content.tabDevTools.value };

	// Use pathname prop for testing, otherwise use router's location
	const currentPathname = pathname ?? location.pathname;

	// Integrations state
	const [hasIntegrations, setHasIntegrations] = useState<boolean | undefined>(undefined);
	const [checkingIntegrations, setCheckingIntegrations] = useState(false);
	const [githubSetupComplete, setGithubSetupComplete] = useState(false);

	// Check for integrations after login
	useEffect(() => {
		if (userInfo && !checkingIntegrations && hasIntegrations === undefined) {
			checkIntegrations();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [userInfo, checkingIntegrations, hasIntegrations]);

	// Check for GitHub setup completion and CLI callback in URL params
	useEffect(() => {
		if (userInfo) {
			const urlParams = new URLSearchParams(location.search);
			// Check for GitHub setup completion
			const githubSetup = urlParams.get("github_setup");
			if (githubSetup === "success") {
				setGithubSetupComplete(true);
				setHasIntegrations(true);
				// Clean up URL
				navigate("/");
			}

			// Check for CLI callback
			let cliCallback = urlParams.get("cli_callback");
			if (!cliCallback) {
				cliCallback = sessionStorage.getItem("cli_callback");
			}
			if (cliCallback) {
				sessionStorage.removeItem("cli_callback");
				handleCliCallback(cliCallback).then();
			}
		}
	}, [userInfo, location.search, navigate, redirect]);

	async function handleCliCallback(cliCallback: string): Promise<void> {
		const callbackUrl = new URL(cliCallback);
		try {
			const token = await client.auth().getCliToken();
			callbackUrl.searchParams.set("token", token);
		} catch (_error) {
			callbackUrl.searchParams.set("error", "failed_to_get_token");
		}
		redirect(callbackUrl.toString());
	}

	function checkIntegrations(): void {
		setCheckingIntegrations(true);
		client
			.integrations()
			.listIntegrations()
			.then(async integrations => {
				if (integrations.length > 0) {
					setHasIntegrations(true);
				} else {
					// No integrations enabled, but check if there are installations
					try {
						const installations = await client.github().getGitHubInstallations();
						if (installations.length > 0) {
							// Has installations but no enabled integrations
							// Redirect to the first installation to enable repos
							// BUT: Don't redirect if user is on devtools tab
							const pathSegments = currentPathname.split("/").filter(Boolean);
							const currentTab = pathSegments[0] || "dashboard";
							if (currentTab !== "devtools") {
								const first = installations[0];
								const containerType = first.containerType;
								const containerName = first.name;
								navigate(`/integrations/github/${containerType}/${containerName}`);
							}
							// Still set hasIntegrations to true to avoid showing getting started
							setHasIntegrations(true);
						} else {
							// No installations and no integrations
							setHasIntegrations(false);
						}
					} catch {
						// Error fetching installations, treat as no integrations
						setHasIntegrations(false);
					}
				}
			})
			.catch(() => {
				setHasIntegrations(false);
			})
			.finally(() => {
				setCheckingIntegrations(false);
			});
	}

	function refreshIntegrations(): void {
		setHasIntegrations(undefined);
		setCheckingIntegrations(false);
	}

	function integrationSetupComplete(): void {
		setHasIntegrations(true);
		setGithubSetupComplete(false);
	}

	const navigationParams = useMemo<Navigation>(() => {
		const pathSegments = currentPathname.split("/").filter(Boolean);
		const firstSegment = pathSegments[0] || "dashboard";
		const activeTab = isTabName(firstSegment) ? firstSegment : "dashboard";

		// Build tabs list - include dev tools tab if enabled
		const tabs = devToolsEnabled ? [...baseTabs, devToolsTab] : baseTabs;

		function getPathSegment(index: number): string | undefined {
			const segment = pathSegments[index];
			return segment ? decodeURIComponent(segment) : undefined;
		}

		// Parse article routing
		const { articleView, articleJrn } = parseArticleRoute(pathSegments, getPathSegment);

		// Parse integration routing
		const { integrationView, integrationContainer, integrationContainerType, staticFileIntegrationId } =
			parseIntegrationRoute(pathSegments, getPathSegment);

		// Parse draft routing
		const { draftView, draftId } = parseDraftRoute(pathSegments, getPathSegment);

		// Parse site routing
		const { siteView, siteId } = parseSiteRoute(pathSegments, getPathSegment);

		return {
			tabs,
			activeTab,
			articleView,
			articleJrn,
			integrationView,
			integrationContainer,
			integrationContainerType,
			staticFileIntegrationId,
			draftView,
			draftId,
			siteView,
			siteId,
			navigate,
			open,
			hasIntegrations,
			githubSetupComplete,
			checkIntegrations,
			refreshIntegrations,
			integrationSetupComplete,
		};
	}, [currentPathname, navigate, open, hasIntegrations, githubSetupComplete, devToolsEnabled]);

	return <NavigationContext.Provider value={navigationParams}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): Navigation {
	const context = useContext(NavigationContext);
	if (!context) {
		throw new Error("userNavigation must be used within a NavigationProvider");
	}
	return context;
}

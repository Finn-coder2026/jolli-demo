import type { Tab } from "../types/Tab";
import { useClient } from "./ClientContext";
import { usePermissions } from "./PermissionContext";
import { useLocation, useNavigate, useOpen, useRedirect } from "./RouterContext";
import type { UserInfo } from "jolli-common";
import { LayoutGrid } from "lucide-react";
import { createContext, type ReactElement, type ReactNode, useContext, useEffect, useMemo } from "react";
import { useIntlayer } from "react-intlayer";

const TAB_NAMES = [
	"inbox",
	"dashboard",
	"articles",
	"sites",
	"spaces",
	"analytics",
	"integrations",
	"users",
	"roles",
	"settings",
	"devtools",
	"agent",
] as const;

export type TabName = (typeof TAB_NAMES)[number];

export type ArticleView = "list" | "detail" | "preview" | "source" | "none";
export type SiteView = "list" | "detail" | "create" | "none";
export type SettingsView = "profile" | "preferences" | "none";
export type SpaceSettingsView = "general" | "sources" | "none";
export type SiteSettingsView = "general" | "none";
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
	currentUserId: number | undefined;
	currentUserName: string | undefined;
	articleView: ArticleView;
	articleJrn: string | undefined;
	integrationView: IntegrationView;
	integrationContainer: string | undefined;
	integrationContainerType: "org" | "user" | undefined;
	staticFileIntegrationId: number | undefined;
	draftView: DraftView;
	draftId: number | undefined;
	/** Draft ID for inline editing within the articles page (via ?edit=id query param) */
	inlineEditDraftId: number | undefined;
	/** Selected document ID for preserving selection state (via ?doc=id query param) */
	selectedDocId: number | undefined;
	siteView: SiteView;
	siteId: number | undefined;
	settingsView: SettingsView;
	spaceSettingsView: SpaceSettingsView;
	spaceSettingsSpaceId: number | undefined;
	siteSettingsView: SiteSettingsView;
	siteSettingsSiteId: number | undefined;
	navigate(pathname: string): void;
	open(pathname: string): void;
}

const NavigationContext = createContext<Navigation | undefined>(undefined);

interface NavigationProviderProps {
	children: ReactNode;
	pathname?: string; // For testing
	userInfo?: UserInfo | undefined;
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

	// Handle both /integrations/* (standard) and /settings/sources/* (legacy) routes
	const isIntegrationsRoute = pathSegments[0] === "integrations";
	const isSettingsSourcesRoute = pathSegments[0] === "settings" && pathSegments[1] === "sources";

	if (isIntegrationsRoute || isSettingsSourcesRoute) {
		// Offset for settings/sources routes (segments are shifted by 1)
		const offset = isSettingsSourcesRoute ? 1 : 0;
		const secondSegment = getPathSegment(1 + offset);

		if (!secondSegment) {
			integrationView = "main";
		} else if (secondSegment === "github") {
			const thirdSegment = getPathSegment(2 + offset);
			if (!thirdSegment) {
				integrationView = "github";
			} else if (thirdSegment === "org" || thirdSegment === "user") {
				integrationContainerType = thirdSegment;
				const fourthSegment = getPathSegment(3 + offset);
				if (fourthSegment) {
					integrationContainer = fourthSegment;
					integrationView = thirdSegment === "org" ? "github-org-repos" : "github-user-repos";
				}
			}
		} else if (secondSegment === "static-file") {
			const thirdSegment = getPathSegment(2 + offset);
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
		// Don't match if this is a settings route (/sites/:id/settings/...)
		if (pathSegments[2] === "settings") {
			return { siteView, siteId };
		}
		const secondSegment = getPathSegment(1);
		if (!secondSegment) {
			siteView = "list";
		} else if (secondSegment === "new") {
			siteView = "create";
		} else {
			const parsed = Number.parseInt(secondSegment, 10);
			if (!Number.isNaN(parsed)) {
				siteView = "detail";
				siteId = parsed;
			}
		}
	}

	return { siteView, siteId };
}

function parseSettingsRoute(
	pathSegments: Array<string>,
	getPathSegment: (index: number) => string | undefined,
): { settingsView: SettingsView } {
	let settingsView: SettingsView = "none";

	if (pathSegments[0] === "settings") {
		const secondSegment = getPathSegment(1);
		if (!secondSegment || secondSegment === "profile") {
			// Default to profile if no sub-route specified
			settingsView = "profile";
		} else if (secondSegment === "preferences") {
			settingsView = "preferences";
		}
	}

	return { settingsView };
}

function parseSpaceSettingsRoute(
	pathSegments: Array<string>,
	getPathSegment: (index: number) => string | undefined,
): { spaceSettingsView: SpaceSettingsView; spaceSettingsSpaceId: number | undefined } {
	let spaceSettingsView: SpaceSettingsView = "none";
	let spaceSettingsSpaceId: number | undefined;

	// Match /spaces/:spaceId/settings or /spaces/:spaceId/settings/general
	if (pathSegments[0] === "spaces" && pathSegments[2] === "settings") {
		const spaceIdSegment = getPathSegment(1);
		if (spaceIdSegment) {
			const spaceId = Number.parseInt(spaceIdSegment, 10);
			if (!Number.isNaN(spaceId)) {
				spaceSettingsSpaceId = spaceId;
				const settingsSubRoute = getPathSegment(3);
				// Default to general if no sub-route or explicit general
				if (!settingsSubRoute || settingsSubRoute === "general") {
					spaceSettingsView = "general";
				} else if (settingsSubRoute === "sources") {
					spaceSettingsView = "sources";
				}
			}
		}
	}

	return { spaceSettingsView, spaceSettingsSpaceId };
}

/** Map of route tabs to their required view permissions */
const ROUTE_PERMISSION_MAP: Record<string, string> = {
	dashboard: "dashboard.view",
	articles: "articles.view",
	sites: "sites.view",
	integrations: "integrations.view",
	users: "users.view",
	roles: "roles.view",
};

/**
 * Returns the required permission for a given pathname, or undefined if no permission check is needed.
 * Returns undefined for the dashboard route (the fallback redirect target) to prevent redirect loops.
 */
function getRequiredRoutePermission(pathname: string): string | undefined {
	const segments = pathname.split("/").filter(Boolean);
	const firstSegment = segments[0] || "dashboard";

	// Dashboard is the fallback redirect target — never guard it
	if (firstSegment === "dashboard") {
		return;
	}

	// Special case: /settings/sources requires integrations.view
	if (firstSegment === "settings" && segments[1] === "sources") {
		return ROUTE_PERMISSION_MAP.integrations;
	}

	return isTabName(firstSegment) ? ROUTE_PERMISSION_MAP[firstSegment] : undefined;
}

function parseSiteSettingsRoute(
	pathSegments: Array<string>,
	getPathSegment: (index: number) => string | undefined,
): { siteSettingsView: SiteSettingsView; siteSettingsSiteId: number | undefined } {
	let siteSettingsView: SiteSettingsView = "none";
	let siteSettingsSiteId: number | undefined;

	// Match /sites/:siteId/settings or /sites/:siteId/settings/general
	if (pathSegments[0] === "sites" && pathSegments[2] === "settings") {
		const siteIdSegment = getPathSegment(1);
		if (siteIdSegment) {
			const siteId = Number.parseInt(siteIdSegment, 10);
			if (!Number.isNaN(siteId)) {
				siteSettingsSiteId = siteId;
				const settingsSubRoute = getPathSegment(3);
				// Default to general if no sub-route or explicit general
				if (!settingsSubRoute || settingsSubRoute === "general") {
					siteSettingsView = "general";
				}
			}
		}
	}

	return { siteSettingsView, siteSettingsSiteId };
}

export function NavigationProvider({ children, pathname, userInfo }: NavigationProviderProps): ReactElement {
	const location = useLocation();
	const navigate = useNavigate();
	const open = useOpen();
	const redirect = useRedirect();
	const client = useClient();
	const { hasPermission, isLoading: isLoadingPermissions } = usePermissions();
	const content = useIntlayer("app-layout");

	// Define tabs with localized labels
	// Note: Users, Integrations (Sources), and Roles are now in Settings sidebar
	// Other routes (articles, sites, analytics, settings) remain functional via direct URLs
	const baseTabs: Array<Tab<TabName>> = [{ name: "dashboard", icon: LayoutGrid, label: content.tabDashboard.value }];

	// Use pathname prop for testing, otherwise use router's location
	const currentPathname = pathname ?? location.pathname;

	// Check for CLI callback in URL params
	useEffect(() => {
		if (userInfo) {
			let cliCallback = new URLSearchParams(location.search).get("cli_callback");
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
			const { token, space } = await client.auth().getCliToken();
			callbackUrl.searchParams.set("token", token);
			if (space) {
				callbackUrl.searchParams.set("space", space);
			}
		} catch (_error) {
			callbackUrl.searchParams.set("error", "failed_to_get_token");
		}
		redirect(callbackUrl.toString());
	}

	// Route-level permission guard: redirect unauthorized users to /dashboard
	useEffect(() => {
		if (isLoadingPermissions) {
			return;
		}
		const requiredPermission = getRequiredRoutePermission(currentPathname);
		if (requiredPermission && !hasPermission(requiredPermission)) {
			navigate("/dashboard");
		}
	}, [currentPathname, isLoadingPermissions, hasPermission, navigate]);

	const navigationParams = useMemo<Navigation>(() => {
		const pathSegments = currentPathname.split("/").filter(Boolean);
		const firstSegment = pathSegments[0] || "dashboard";
		const activeTab = isTabName(firstSegment) ? firstSegment : "dashboard";

		/** Check if a tab should be displayed based on permissions. */
		function isTabVisible(tab: (typeof baseTabs)[number]): boolean {
			const requiredPermission = ROUTE_PERMISSION_MAP[tab.name];
			/* v8 ignore next 3 - all current baseTabs have required permissions; branch kept for future extensibility */
			if (!requiredPermission) {
				return true; // No permission required (e.g., settings)
			}
			return hasPermission(requiredPermission);
		}

		// Build tabs list - filter by permissions
		// Don't filter while permissions are loading to avoid flickering/hiding tabs temporarily
		const filteredTabs = isLoadingPermissions ? baseTabs : baseTabs.filter(isTabVisible);
		// Dev Tools, Settings, Analytics, Sites, and Articles tabs are not shown in the navigation
		// (but can still be accessed via direct URLs)
		const tabs = filteredTabs;

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

		// Parse settings routing
		const { settingsView } = parseSettingsRoute(pathSegments, getPathSegment);

		// Parse inline edit query param (?edit=draftId) for in-place article editing
		const searchParams = new URLSearchParams(location.search);
		const editParam = searchParams.get("edit");
		const inlineEditDraftId = editParam ? Number.parseInt(editParam, 10) : undefined;

		// Parse selected doc query param (?doc=docId) for preserving selection state
		const docParam = searchParams.get("doc");
		const selectedDocId = docParam ? Number.parseInt(docParam, 10) : undefined;

		// Parse space settings routing
		const { spaceSettingsView, spaceSettingsSpaceId } = parseSpaceSettingsRoute(pathSegments, getPathSegment);

		// Parse site settings routing
		const { siteSettingsView, siteSettingsSiteId } = parseSiteSettingsRoute(pathSegments, getPathSegment);

		return {
			tabs,
			activeTab,
			currentUserId: userInfo?.userId,
			currentUserName: userInfo?.name,
			articleView,
			articleJrn,
			integrationView,
			integrationContainer,
			integrationContainerType,
			staticFileIntegrationId,
			draftView,
			draftId,
			inlineEditDraftId: Number.isNaN(inlineEditDraftId) ? undefined : inlineEditDraftId,
			selectedDocId: Number.isNaN(selectedDocId) ? undefined : selectedDocId,
			siteView,
			siteId,
			settingsView,
			spaceSettingsView,
			spaceSettingsSpaceId,
			siteSettingsView,
			siteSettingsSiteId,
			navigate,
			open,
		};
	}, [
		currentPathname,
		location.search,
		navigate,
		open,
		userInfo?.userId,
		userInfo?.name,
		hasPermission,
		isLoadingPermissions,
	]);

	return <NavigationContext.Provider value={navigationParams}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): Navigation {
	const context = useContext(NavigationContext);
	if (!context) {
		throw new Error("useNavigation must be used within a NavigationProvider");
	}
	return context;
}

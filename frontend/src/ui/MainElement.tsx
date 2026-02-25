import { Toaster } from "../components/ui/Sonner";
import { ClientProvider } from "../contexts/ClientContext";
import { CurrentUserProvider, useCurrentUser } from "../contexts/CurrentUserContext";
import { DevToolsProvider } from "../contexts/DevToolsContext";
import {
	NavigationProvider,
	type SiteSettingsView,
	type SpaceSettingsView,
	type TabName,
	useNavigation,
} from "../contexts/NavigationContext";
import { OrgProvider, useOrg } from "../contexts/OrgContext";
import { PermissionProvider } from "../contexts/PermissionContext";
import { PreferencesProvider } from "../contexts/PreferencesContext";
import { RouterProvider, useBasename, useLocation, useNavigate } from "../contexts/RouterContext";
import { SitesProvider } from "../contexts/SitesContext";
import { SpaceProvider, useSpace } from "../contexts/SpaceContext";
import { TenantProvider } from "../contexts/TenantContext";
import { ThemeProvider } from "../contexts/ThemeContext";
import { clearRememberMePreference, hasEmailSelectionCookie, setAuthCookieDomain } from "../util/AuthCookieUtil";
import { getLog } from "../util/Logger";
import { Analytics } from "./Analytics";
import { AppLayout } from "./AppLayout";
import { ArticlesWithSuggestedUpdates } from "./ArticlesWithSuggestedUpdates";
import { AcceptInvitationPage } from "./auth/AcceptInvitationPage";
import { AcceptOwnerInvitationPage } from "./auth/AcceptOwnerInvitationPage";
import { ForgotPasswordPage } from "./auth/ForgotPasswordPage";
import { LandingPage } from "./auth/LandingPage";
import { LoginPage } from "./auth/LoginPage";
import { ResetPasswordPage } from "./auth/ResetPasswordPage";
import { TenantSelector } from "./auth/TenantSelector";
import { Dashboard } from "./Dashboard";
import { DraftArticles } from "./DraftArticles";
import { DevTools } from "./devtools/DevTools";
import { Inbox } from "./Inbox";
import { Integrations } from "./integrations/Integrations";
import { OnboardingPage } from "./onboarding/OnboardingPage";
import { Preview } from "./Preview";
import { Roles } from "./Roles";
import { SessionExpiredDialog } from "./SessionExpiredDialog";
import { Settings } from "./Settings";
import { Sites } from "./Sites";
import { SourceView } from "./SourceView";
import { Spaces } from "./Spaces";
import { SettingsLayout } from "./settings/SettingsLayout";
import { SiteGeneralSettings } from "./sites/settings/SiteGeneralSettings";
import { SiteSettingsLayout } from "./sites/settings/SiteSettingsLayout";
import { SpaceGeneralSettings } from "./spaces/settings/SpaceGeneralSettings";
import { SpaceSettingsLayout } from "./spaces/settings/SpaceSettingsLayout";
import { SpaceSourcesSettings } from "./spaces/settings/SpaceSourcesSettings";
import { Users } from "./Users";
import { type Client, type ClientCallbacks, createClient, type UserInfo } from "jolli-common";
import { lazy, type ReactElement, Suspense, useCallback, useEffect, useMemo, useState } from "react";

/** Lazy-loaded — defers the tiptap editor (~620 KB vendor) until draft editing. */
const LazyArticleDraft = lazy(() => import("./ArticleDraft").then(mod => ({ default: mod.ArticleDraft })));

/** Lazy-loaded — defers the agent page until navigated to. */
const LazyAgentPage = lazy(() => import("./agent/AgentPage").then(mod => ({ default: mod.AgentPage })));

const log = getLog(import.meta);

/** Stable wrapper for the lazy-loaded Agent page — must be defined outside MainContent
 * so that its function reference stays the same across renders (prevents unmount/remount). */
function AgentView(): ReactElement {
	return (
		<Suspense fallback={null}>
			<LazyAgentPage />
		</Suspense>
	);
}

/**
 * Type definition for view components
 */
export type ViewComponents = {
	Inbox(): ReactElement;
	Dashboard(): ReactElement;
	Articles(): ReactElement;
	Sites(): ReactElement;
	Analytics(): ReactElement;
	Integrations(): ReactElement;
	Users(): ReactElement;
	Roles(): ReactElement;
	Settings(): ReactElement;
	DevTools(): ReactElement | null;
	Agent(): ReactElement;
};

/**
 * Renders the appropriate view component based on activeView.
 * The default case is defensive code that should never execute in normal operation.
 * Exported for testing purposes.
 */
export function renderViewWithFallback(activeTab: TabName, components: ViewComponents): ReactElement | null {
	const { Inbox, Dashboard, Articles, Sites, Analytics, Integrations, Users, Roles, Settings, DevTools, Agent } =
		components;

	switch (activeTab) {
		case "inbox":
			return <Inbox />;
		case "dashboard":
			return <Dashboard />;
		case "articles":
			return <Articles />;
		/* c8 ignore next 2 -- Sites component has its own test file */
		case "sites":
			return <Sites />;
		case "analytics":
			return <Analytics />;
		/* c8 ignore next 2 -- Integrations component has its own test file */
		case "integrations":
			return <Integrations />;
		/* c8 ignore next 2 -- Users component has its own test file */
		case "users":
			return <Users />;
		/* c8 ignore next 2 -- Roles component has its own test file */
		case "roles":
			return <Roles />;
		case "settings":
			return <Settings />;
		case "devtools":
			return <DevTools />;
		case "agent":
			return <Agent />;
		default:
			// Defensive fallback - should never be reached
			return <Articles />;
	}
}

/**
 * Gets the URL path for a given view
 * Exported for testing purposes.
 */
export function getUrlForView(view: string): string {
	if (view === "dashboard") {
		return "/";
	}
	if (view === "inbox") {
		return "/inbox";
	}
	return `/${view}`;
}

/**
 * Gets the redirect path for a logged-in user at /login.
 * If user has tenant context (tenantId and orgId) → articles.
 * Otherwise → tenant selector (user needs to select a tenant).
 */
function getLoggedInRedirectPath(userInfo: UserInfo): string {
	// User has valid tenant context - they can access the app
	if (userInfo.tenantId && userInfo.orgId) {
		return "/articles";
	}
	// No tenant context - user needs to select a tenant
	return "/select-tenant";
}

/**
 * Check whether the current /login request is in GitHub email-selection flow.
 * In this flow LoginPage must mount to read URL/cookie state and show selection UI.
 */
function hasPendingEmailSelectionOnLoginRoute(): boolean {
	const params = new URLSearchParams(window.location.search);
	const isSelectingEmail = params.get("select_email") === "true";
	return isSelectingEmail || hasEmailSelectionCookie();
}

/**
 * Renders the login route, handling redirect for logged-in users.
 * Skip redirect when URL has an error param (e.g., user_inactive) — the user was
 * deliberately sent here to see the error message.
 * Exported for testing purposes.
 */
export function renderLoginRoute(
	userInfo: UserInfo | undefined,
	isLoadingAuth: boolean,
	navigate: (path: string) => void,
): ReactElement {
	const hasUrlError = new URLSearchParams(window.location.search).has("error");
	const hasPendingEmailSelection = hasPendingEmailSelectionOnLoginRoute();
	if (userInfo && !hasUrlError && !hasPendingEmailSelection) {
		navigate(getLoggedInRedirectPath(userInfo));
		return <div className="flex h-screen items-center justify-center bg-background" />;
	}
	// If still checking auth, show loading state (prevents flash of login page)
	if (isLoadingAuth) {
		return <div className="flex h-screen items-center justify-center bg-background" />;
	}
	return <LoginPage />;
}

/**
 * Renders public auth routes that don't require authentication.
 * Returns the component if the path matches, or null to continue to other routes.
 * Exported for testing purposes.
 */
export function renderPublicAuthRoute(pathname: string): ReactElement | null {
	/* c8 ignore next 3 -- TenantSelector has its own test file */
	if (pathname === "/select-tenant") {
		return <TenantSelector />;
	}

	/* c8 ignore next 3 -- ForgotPasswordPage has its own test file */
	if (pathname === "/forgot-password") {
		return <ForgotPasswordPage />;
	}

	/* c8 ignore next 3 -- ResetPasswordPage has its own test file */
	if (pathname === "/reset-password") {
		return <ResetPasswordPage />;
	}

	/* c8 ignore next 3 -- component has its own test file */
	if (pathname === "/invite/accept") {
		return <AcceptInvitationPage />;
	}

	/* c8 ignore next 3 -- component has its own test file */
	if (pathname === "/owner-invite/accept") {
		return <AcceptOwnerInvitationPage />;
	}

	return null;
}

const PUBLIC_ROUTES = new Set([
	"/",
	"/login",
	"/select-tenant",
	"/forgot-password",
	"/reset-password",
	"/invite/accept",
	"/owner-invite/accept",
]);

function isPublicRoute(pathname: string): boolean {
	return PUBLIC_ROUTES.has(pathname);
}

function LoadingScreen(): ReactElement {
	return <div className="flex h-screen items-center justify-center bg-background" />;
}

interface PublicShellContentProps {
	userInfo: UserInfo | undefined;
	isLoadingAuth: boolean;
	authGatewayOrigin?: string | undefined;
}

function PublicShellContent({ userInfo, isLoadingAuth, authGatewayOrigin }: PublicShellContentProps): ReactElement {
	const location = useLocation();
	const navigate = useNavigate();

	if (location.pathname === "/") {
		return <LandingPage isLoggedIn={!!userInfo} authGatewayOrigin={authGatewayOrigin} />;
	}

	if (location.pathname === "/login") {
		return renderLoginRoute(userInfo, isLoadingAuth, navigate);
	}

	if (location.pathname === "/select-tenant") {
		if (isLoadingAuth) {
			return <LoadingScreen />;
		}
		if (!userInfo) {
			if (authGatewayOrigin) {
				const currentPath = window.location.pathname + window.location.search;
				const redirectParam = encodeURIComponent(currentPath);
				window.location.href = `${authGatewayOrigin}/login?redirect=${redirectParam}`;
			} else {
				window.location.href = "/login";
			}
			return <LoadingScreen />;
		}
		return <TenantSelector />;
	}

	const publicRoute = renderPublicAuthRoute(location.pathname);
	if (publicRoute) {
		return publicRoute;
	}

	return <LoadingScreen />;
}

interface ProtectedShellProps {
	client: Client;
	userInfo: UserInfo;
	doLogin(): void;
	doLogout(): void;
	authGatewayOrigin?: string | undefined;
	showExpiredDialog: boolean;
	dismissExpiredDialog(): void;
}

function ProtectedShell({
	client,
	userInfo,
	doLogin,
	doLogout,
	authGatewayOrigin,
	showExpiredDialog,
	dismissExpiredDialog,
}: ProtectedShellProps): ReactElement {
	const [isLoadingOnboarding, setIsLoadingOnboarding] = useState(false);
	const [needsOnboarding, setNeedsOnboarding] = useState(false);
	const [onboardingChecked, setOnboardingChecked] = useState(false);

	useEffect(() => {
		client.visit().then();
	}, [client]);

	// Check onboarding status after login (only once per shell mount)
	useEffect(() => {
		if (!isLoadingOnboarding && !onboardingChecked) {
			log.debug("Checking onboarding status for user: %s (id=%d)", userInfo.email, userInfo.userId);
			setIsLoadingOnboarding(true);
			client
				.onboarding()
				.getState()
				.then(response => {
					log.debug(
						"Onboarding API response: needsOnboarding=%s, status=%s",
						response.needsOnboarding,
						response.state?.status ?? "no_state",
					);
					setNeedsOnboarding(response.needsOnboarding);
				})
				.catch(error => {
					log.error(error, "Failed to check onboarding status");
					// Don't block user if onboarding check fails
					setNeedsOnboarding(false);
				})
				.finally(() => {
					setIsLoadingOnboarding(false);
					setOnboardingChecked(true);
				});
		}
	}, [client, isLoadingOnboarding, onboardingChecked, userInfo.email, userInfo.userId]);

	// Listen for onboarding restart events (dispatched from ProfilePage)
	useEffect(() => {
		function handleOnboardingRestart(): void {
			setOnboardingChecked(false);
		}
		window.addEventListener("jolli:onboarding-restart", handleOnboardingRestart);
		return () => window.removeEventListener("jolli:onboarding-restart", handleOnboardingRestart);
	}, []);

	// Handle onboarding completion
	const handleOnboardingComplete = useCallback((): void => {
		setNeedsOnboarding(false);
	}, []);

	return (
		<OrgProvider>
			<TenantProvider>
				<DevToolsProvider>
					<PermissionProvider>
						<CurrentUserProvider>
							<NavigationProvider userInfo={userInfo}>
								<PreferencesProvider>
									<ThemeProvider>
										<SpaceProvider>
											<SitesProvider>
												<MainContent
													userInfo={userInfo}
													isLoadingAuth={false}
													doLogin={doLogin}
													doLogout={doLogout}
													authGatewayOrigin={authGatewayOrigin}
													showExpiredDialog={showExpiredDialog}
													dismissExpiredDialog={dismissExpiredDialog}
												/>
												{/* Onboarding dialog overlay - shown when user needs onboarding */}
												{needsOnboarding && (
													<OnboardingPage onComplete={handleOnboardingComplete} />
												)}
											</SitesProvider>
										</SpaceProvider>
										<Toaster />
									</ThemeProvider>
								</PreferencesProvider>
							</NavigationProvider>
						</CurrentUserProvider>
					</PermissionProvider>
				</DevToolsProvider>
			</TenantProvider>
		</OrgProvider>
	);
}

interface ShellRouterProps {
	client: Client;
	userInfo: UserInfo | undefined;
	isLoadingAuth: boolean;
	doLogin(): void;
	doLogout(): void;
	authGatewayOrigin?: string | undefined;
	showExpiredDialog: boolean;
	dismissExpiredDialog(): void;
}

function ShellRouter({
	client,
	userInfo,
	isLoadingAuth,
	doLogin,
	doLogout,
	authGatewayOrigin,
	showExpiredDialog,
	dismissExpiredDialog,
}: ShellRouterProps): ReactElement {
	const location = useLocation();
	const urlCliCallback = new URLSearchParams(location.search).get("cli_callback");
	let hasPendingCliCallback = !!urlCliCallback;
	if (!hasPendingCliCallback && userInfo) {
		try {
			hasPendingCliCallback = !!sessionStorage.getItem("cli_callback");
		} catch {
			hasPendingCliCallback = false;
		}
	}

	// Keep CLI callback handling in the protected shell even on "/".
	if (location.pathname === "/" && userInfo && hasPendingCliCallback) {
		return (
			<ProtectedShell
				client={client}
				userInfo={userInfo}
				doLogin={doLogin}
				doLogout={doLogout}
				authGatewayOrigin={authGatewayOrigin}
				showExpiredDialog={showExpiredDialog}
				dismissExpiredDialog={dismissExpiredDialog}
			/>
		);
	}

	if (isPublicRoute(location.pathname)) {
		return (
			<PublicShellContent
				userInfo={userInfo}
				isLoadingAuth={isLoadingAuth}
				authGatewayOrigin={authGatewayOrigin}
			/>
		);
	}

	if (isLoadingAuth) {
		return <LoadingScreen />;
	}

	if (!userInfo) {
		const currentPath = window.location.pathname + window.location.search;
		const redirectParam = encodeURIComponent(currentPath);
		if (authGatewayOrigin) {
			window.location.href = `${authGatewayOrigin}/login?redirect=${redirectParam}`;
		} else {
			window.location.href = `/login?redirect=${redirectParam}`;
		}
		return <LoadingScreen />;
	}

	return (
		<ProtectedShell
			client={client}
			userInfo={userInfo}
			doLogin={doLogin}
			doLogout={doLogout}
			authGatewayOrigin={authGatewayOrigin}
			showExpiredDialog={showExpiredDialog}
			dismissExpiredDialog={dismissExpiredDialog}
		/>
	);
}

/**
 * Props for MainContent. Exported for testing purposes.
 */
export interface MainContentProps {
	userInfo: UserInfo | undefined;
	isLoadingAuth: boolean;
	doLogin(): void;
	doLogout(): void;
	authGatewayOrigin?: string | undefined;
	/** Whether to show the session expired dialog */
	showExpiredDialog: boolean;
	/** Dismiss the session expired dialog */
	dismissExpiredDialog(): void;
}

/** Renders the appropriate site settings page, or null if not on a settings route. */
function renderSiteSettingsPage(view: SiteSettingsView): ReactElement | null {
	if (view === "none") {
		return null;
	}
	return <SiteSettingsLayout>{view === "general" && <SiteGeneralSettings />}</SiteSettingsLayout>;
}

/** Renders the appropriate space settings page, or null if not on a settings route. */
function renderSpaceSettingsPage(view: SpaceSettingsView): ReactElement | null {
	if (view === "none") {
		return null;
	}
	return (
		<SpaceSettingsLayout>
			{view === "general" && <SpaceGeneralSettings />}
			{view === "sources" && <SpaceSourcesSettings />}
		</SpaceSettingsLayout>
	);
}

/**
 * Main content component. Exported for testing purposes.
 */
export function MainContent({
	userInfo,
	isLoadingAuth,
	doLogin: _doLogin,
	doLogout,
	authGatewayOrigin,
	showExpiredDialog,
	dismissExpiredDialog,
}: MainContentProps): ReactElement {
	const { activeTab, articleView, articleJrn, draftView, draftId, navigate, spaceSettingsView, siteSettingsView } =
		useNavigation();

	const location = useLocation();
	const basename = useBasename();
	const { tenant: orgTenant } = useOrg();
	const { clearContext } = useCurrentUser();
	const { switchToPersonalSpace } = useSpace();

	// Clear user context on session expiry
	useEffect(() => {
		if (showExpiredDialog) {
			clearContext();
		}
	}, [showExpiredDialog, clearContext]);

	// Wrap doLogout to clear user context before logout
	const handleLogout = useCallback(() => {
		clearContext();
		doLogout();
	}, [clearContext, doLogout]);

	// Switch to personal space when navigating to /spaces/personal
	const isPersonalSpaceRoute = location.pathname === "/spaces/personal";
	useEffect(() => {
		if (isPersonalSpaceRoute) {
			switchToPersonalSpace();
		}
	}, [isPersonalSpaceRoute, switchToPersonalSpace]);

	// Handle re-login when session expires - redirect to login with return URL
	const handleReLogin = useCallback(() => {
		dismissExpiredDialog();
		const currentPath = window.location.pathname + window.location.search;
		const redirectParam = encodeURIComponent(currentPath);
		if (authGatewayOrigin) {
			window.location.href = `${authGatewayOrigin}/login?redirect=${redirectParam}`;
		} else {
			window.location.href = `/login?redirect=${redirectParam}`;
		}
	}, [authGatewayOrigin, dismissExpiredDialog]);

	const handleViewChange = (view: string) => {
		const url = getUrlForView(view);
		navigate(url);
	};

	// Show landing page at root path for all users (logged in or not)
	// This is a public route, so don't show session expired dialog here
	if (location.pathname === "/") {
		return (
			<LandingPage
				isLoggedIn={!!userInfo}
				authGatewayOrigin={authGatewayOrigin}
				onEnterApp={() => {
					// In path-based mode at the root URL (no tenant prefix), the basename
					// is empty. Use a full-page redirect so Main.tsx re-runs tenant detection.
					if (!basename && orgTenant?.slug) {
						window.location.href = `/${orgTenant.slug}/dashboard`;
					} else {
						navigate("/dashboard");
					}
				}}
			/>
		);
	}

	// Check for special auth routes first (before auth check)
	if (location.pathname === "/login") {
		return renderLoginRoute(userInfo, isLoadingAuth, navigate);
	}

	// Check public auth routes (select-tenant, forgot-password, reset-password, invitation pages)
	const publicAuthRoute = renderPublicAuthRoute(location.pathname);
	/* c8 ignore next 3 -- public auth routes have their own test files */
	if (publicAuthRoute) {
		return publicAuthRoute;
	}

	/* c8 ignore next 4 -- Internal callback passed to AppLayout */
	const handleSpaceClick = () => {
		// Always navigate to /articles (clearing any stale ?doc= params from previous space)
		navigate("/articles");
	};

	// If still checking auth, show loading state (prevents flash of login view)
	if (isLoadingAuth) {
		return <div className="flex h-screen items-center justify-center bg-background" />;
	}

	// If session expired, show dialog instead of immediate redirect
	// This gives the user a clear message about what happened
	if (showExpiredDialog) {
		return <SessionExpiredDialog isOpen={true} onReLogin={handleReLogin} />;
	}

	// If not logged in, redirect to auth gateway or show login page
	// Include redirect param so user returns to current page after login
	if (!userInfo) {
		if (authGatewayOrigin) {
			const currentPath = window.location.pathname + window.location.search;
			const redirectParam = encodeURIComponent(currentPath);
			window.location.href = `${authGatewayOrigin}/login?redirect=${redirectParam}`;
			return <div className="flex h-screen items-center justify-center bg-background" />;
		}
		return <LoginPage />;
	}

	// If logged in but no tenant context (e.g., user accessing a tenant they don't belong to),
	// redirect to tenant selector so they can choose an organization they have access to
	if (!userInfo.tenantId || !userInfo.orgId) {
		navigate("/select-tenant");
		return <div className="flex h-screen items-center justify-center bg-background" />;
	}

	// If on preview route, render Preview standalone (not in AppLayout)
	/* c8 ignore next 3 */
	if (articleView === "preview" && articleJrn) {
		return <Preview jrn={articleJrn} />;
	}

	// If on source route, render SourceView standalone (not in AppLayout)
	/* c8 ignore next 3 */
	if (articleView === "source" && articleJrn) {
		return <SourceView jrn={articleJrn} />;
	}

	// If on draft edit route, render ArticleDraft standalone (not in AppLayout)
	if (draftView === "edit" && draftId) {
		return (
			<Suspense fallback={<div className="flex h-screen items-center justify-center bg-background" />}>
				<LazyArticleDraft />
			</Suspense>
		);
	}

	// If on draft list route, render DraftArticles in AppLayout
	if (draftView === "list") {
		return (
			<AppLayout
				onViewChange={handleViewChange}
				doLogout={handleLogout}
				userInfo={userInfo}
				onSpaceClick={handleSpaceClick}
			>
				<DraftArticles />
			</AppLayout>
		);
	}

	// If on settings/sources route, render Integrations with Settings sidebar
	// This must be checked BEFORE the generic settings check below
	const pathSegments = location.pathname.split("/").filter(Boolean);
	if (pathSegments[0] === "settings" && pathSegments[1] === "sources") {
		return (
			<SettingsLayout activePage="sources">
				<Integrations />
			</SettingsLayout>
		);
	}

	// If on site settings route, render SiteSettingsLayout with appropriate page
	const siteSettingsPage = renderSiteSettingsPage(siteSettingsView);
	if (siteSettingsPage) {
		return siteSettingsPage;
	}

	// If on space settings route, render SpaceSettingsLayout with appropriate page
	const spaceSettingsPage = renderSpaceSettingsPage(spaceSettingsView);
	if (spaceSettingsPage) {
		return spaceSettingsPage;
	}

	// If on settings route, render Settings standalone (has its own sidebar)
	if (activeTab === "settings") {
		return <Settings />;
	}

	// If on users route, render with Settings sidebar
	/* c8 ignore next 7 -- SettingsLayout and Users have their own test files */
	if (activeTab === "users") {
		return (
			<SettingsLayout activePage="users">
				<Users currentUserId={userInfo.userId} />
			</SettingsLayout>
		);
	}

	// If on roles route, render with Settings sidebar
	/* c8 ignore next 7 -- SettingsLayout and Roles have their own test files */
	if (activeTab === "roles") {
		return (
			<SettingsLayout activePage="roles">
				<Roles />
			</SettingsLayout>
		);
	}

	// If on integrations route, render with Settings sidebar
	if (activeTab === "integrations") {
		return (
			<SettingsLayout activePage="sources">
				<Integrations />
			</SettingsLayout>
		);
	}

	// Check for articles sub-routes
	if (pathSegments[0] === "articles" && pathSegments[1] === "suggested-updates") {
		return (
			<AppLayout
				onViewChange={handleViewChange}
				doLogout={handleLogout}
				userInfo={userInfo}
				onSpaceClick={handleSpaceClick}
			>
				<ArticlesWithSuggestedUpdates />
			</AppLayout>
		);
	}

	// Personal space route - render wiki UI with personal space as current space
	if (isPersonalSpaceRoute) {
		return (
			<AppLayout
				onViewChange={handleViewChange}
				doLogout={doLogout}
				userInfo={userInfo}
				onSpaceClick={handleSpaceClick}
			>
				<Spaces />
			</AppLayout>
		);
	}

	// Otherwise render normal app with AppLayout
	return (
		<AppLayout
			onViewChange={handleViewChange}
			doLogout={handleLogout}
			userInfo={userInfo}
			onSpaceClick={handleSpaceClick}
		>
			{renderViewWithFallback(activeTab, {
				Inbox,
				Dashboard,
				Articles: Spaces,
				Sites,
				Analytics,
				Integrations,
				Users: () => <Users currentUserId={userInfo.userId} />,
				Roles,
				Settings,
				DevTools,
				Agent: AgentView,
			})}
		</AppLayout>
	);
}

interface MainElementInternalProps {
	/** Base path for routing (e.g., "/tenant" for path-based multi-tenant mode) */
	basename?: string;
}

function MainElementInternal({ basename = "" }: MainElementInternalProps): ReactElement {
	log.debug("MainElementInternal rendered");

	const [initLogin, setInitLogin] = useState(false);
	const [isLoadingAuth, setIsLoadingAuth] = useState(true);
	const [userInfo, setUserInfo] = useState<UserInfo | undefined>(undefined);
	const [authGatewayOrigin, setAuthGatewayOrigin] = useState<string | undefined>(undefined);
	const [showExpiredDialog, setShowExpiredDialog] = useState(false);

	// Create client callbacks that will trigger session expiration
	const clientCallbacks: ClientCallbacks = useMemo(
		() => ({
			/* c8 ignore next 4 -- Callback triggered by 401 responses, tested via client mock */
			onUnauthorized: () => {
				log.debug("Received 401 unauthorized response");
				setShowExpiredDialog(true);
			},
		}),
		[],
	);

	// Create client with callbacks
	const client = useMemo(() => createClient("", undefined, clientCallbacks), [clientCallbacks]);

	const doLogin = useCallback((): void => {
		client.login().then(({ user }) => {
			setUserInfo(user);
			setIsLoadingAuth(false);
			// Note: favoritesHash is now set by OrgContext when it loads /api/org/current
		});
	}, [client]);

	const doLogout = useCallback((): void => {
		/* c8 ignore next 5 -- Async callback tested via "should call doLogout" test */
		clearRememberMePreference();
		client.logout().then(() => {
			// Full page reload resets all React state; no need for setUserInfo(undefined).
			// Calling it would race with the navigation and trigger the auth-redirect
			// logic, which adds an unwanted ?redirect= param to the login URL.
			window.location.href = "/";
		});
	}, [client]);

	// Fetch session config on mount
	useEffect(() => {
		client
			.auth()
			.getSessionConfig()
			.then(config => {
				log.debug("Loaded session config");
				// Store authGatewayOrigin if available
				if (config.authGatewayOrigin) {
					setAuthGatewayOrigin(config.authGatewayOrigin);
				}
				// Configure cookie domain for cross-subdomain cookies
				setAuthCookieDomain(config.cookieDomain);
			})
			.catch(error => {
				log.error(error, "Failed to load session config");
			});
	}, [client]);

	useEffect(() => {
		if (!initLogin) {
			doLogin();
			setInitLogin(true);
		}
	}, [initLogin, doLogin]);

	// Dismiss session expired dialog
	const dismissExpiredDialog = useCallback((): void => {
		setShowExpiredDialog(false);
	}, []);

	return (
		<ClientProvider client={client} callbacks={clientCallbacks}>
			<RouterProvider basename={basename}>
				<ShellRouter
					client={client}
					userInfo={userInfo}
					isLoadingAuth={isLoadingAuth}
					doLogin={doLogin}
					doLogout={doLogout}
					authGatewayOrigin={authGatewayOrigin}
					showExpiredDialog={showExpiredDialog}
					dismissExpiredDialog={dismissExpiredDialog}
				/>
			</RouterProvider>
		</ClientProvider>
	);
}

export function MainElement({ basename = "" }: { basename?: string } = {}): ReactElement {
	return <MainElementInternal basename={basename} />;
}

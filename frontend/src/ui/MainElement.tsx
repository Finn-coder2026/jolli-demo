import { AppBranding } from "../components/AppBranding";
import { Button } from "../components/ui/Button";
import { ClientProvider } from "../contexts/ClientContext";
import { DevToolsProvider } from "../contexts/DevToolsContext";
import { NavigationProvider, type TabName, useNavigation } from "../contexts/NavigationContext";
import { OrgProvider } from "../contexts/OrgContext";
import { PreferencesProvider } from "../contexts/PreferencesContext";
import { RouterProvider, useLocation } from "../contexts/RouterContext";
import { SessionTimeoutProvider, useSessionTimeout } from "../contexts/SessionTimeoutContext";
import { TenantProvider } from "../contexts/TenantContext";
import { ThemeProvider, useTheme } from "../contexts/ThemeContext";
import { getLog } from "../util/Logger";
import { Analytics } from "./Analytics";
import { AppLayout } from "./AppLayout";
import { ArticleDraft } from "./ArticleDraft";
import { ArticlesWithSuggestedUpdates } from "./ArticlesWithSuggestedUpdates";
import { AuthElement } from "./AuthElement";
import { Dashboard } from "./Dashboard";
import { DraftArticles } from "./DraftArticles";
import { DevTools } from "./devtools/DevTools";
import { IntegrationSetup } from "./integrations/IntegrationSetup";
import { Integrations } from "./integrations/Integrations";
import { Preview } from "./Preview";
import { SessionExpiredDialog } from "./SessionExpiredDialog";
import { Settings } from "./Settings";
import { Sites } from "./Sites";
import { SourceView } from "./SourceView";
import { Spaces } from "./Spaces";
import { type ClientCallbacks, createClient, type UserInfo } from "jolli-common";
import { Moon, Sun } from "lucide-react";
import { type ReactElement, useCallback, useEffect, useMemo, useState } from "react";

const log = getLog(import.meta);

/**
 * Type definition for view components
 */
export type ViewComponents = {
	Dashboard(): ReactElement;
	Articles(): ReactElement;
	Sites(): ReactElement;
	Analytics(): ReactElement;
	Integrations(): ReactElement;
	Settings(): ReactElement;
	DevTools(): ReactElement | null;
};

/**
 * Renders the appropriate view component based on activeView.
 * The default case is defensive code that should never execute in normal operation.
 * Exported for testing purposes.
 */
export function renderViewWithFallback(activeTab: TabName, components: ViewComponents): ReactElement | null {
	const { Dashboard, Articles, Sites, Analytics, Integrations, Settings, DevTools } = components;

	switch (activeTab) {
		case "dashboard":
			return <Dashboard />;
		case "articles":
			return <Articles />;
		case "sites":
			return <Sites />;
		case "analytics":
			return <Analytics />;
		case "integrations":
			return <Integrations />;
		case "settings":
			return <Settings />;
		case "devtools":
			return <DevTools />;
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
	return view === "dashboard" ? "/" : `/${view}`;
}

function LoginView({ doLogin }: { doLogin: () => void }): ReactElement {
	const { isDarkMode, toggleTheme } = useTheme();

	return (
		<div className="flex h-screen items-center justify-center bg-background">
			<div className="absolute top-4 right-4">
				<Button
					variant="ghost"
					size="icon"
					onClick={toggleTheme}
					className="hover:bg-muted rounded-lg transition-colors"
				>
					{isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
				</Button>
			</div>
			<div className="w-full max-w-md p-8">
				<AppBranding variant="centered" />
				<AuthElement doLogin={doLogin} />
			</div>
		</div>
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
	chatBotOpen: boolean;
	setChatBotOpen(open: boolean): void;
	onReLogin(): void;
}

/**
 * Main content component. Exported for testing purposes.
 */
export function MainContent({
	userInfo,
	isLoadingAuth,
	doLogin,
	doLogout,
	chatBotOpen,
	setChatBotOpen,
	onReLogin,
}: MainContentProps): ReactElement {
	const {
		activeTab,
		articleView,
		articleJrn,
		draftView,
		draftId,
		navigate,
		hasIntegrations,
		githubSetupComplete,
		integrationSetupComplete,
	} = useNavigation();

	const location = useLocation();
	const { showExpiredDialog } = useSessionTimeout();

	const handleViewChange = (view: string) => {
		const url = getUrlForView(view);
		navigate(url);
	};

	// If still checking auth, show loading state (prevents flash of login view)
	if (isLoadingAuth) {
		return <div className="flex h-screen items-center justify-center bg-background" />;
	}

	// If not logged in, show login view
	if (!userInfo) {
		return <LoginView doLogin={doLogin} />;
	}

	// Session expired dialog - shown on top of any view
	if (showExpiredDialog) {
		return (
			<>
				<SessionExpiredDialog isOpen={showExpiredDialog} onReLogin={onReLogin} />
				{/* Keep the current view visible behind the dialog */}
				<div className="pointer-events-none opacity-50">
					<LoginView doLogin={doLogin} />
				</div>
			</>
		);
	}

	// If logged in but no integrations, show getting started wizard
	// Exception: allow access to devtools tab even without integrations
	if (hasIntegrations === false && activeTab !== "devtools") {
		return <IntegrationSetup onComplete={integrationSetupComplete} initialSuccess={githubSetupComplete} />;
	}

	// If we're still checking for integrations, show nothing (or a loading state)
	if (hasIntegrations === undefined) {
		return <div className="flex h-screen items-center justify-center">Loading...</div>;
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
		return <ArticleDraft />;
	}

	// If on draft list route, render DraftArticles in AppLayout
	if (draftView === "list") {
		return (
			<AppLayout
				onViewChange={handleViewChange}
				chatBotOpen={chatBotOpen}
				onChatBotToggle={setChatBotOpen}
				doLogout={doLogout}
			>
				<DraftArticles />
			</AppLayout>
		);
	}

	// Check for articles sub-routes
	const pathSegments = location.pathname.split("/").filter(Boolean);
	if (pathSegments[0] === "articles" && pathSegments[1] === "suggested-updates") {
		return (
			<AppLayout
				onViewChange={handleViewChange}
				chatBotOpen={chatBotOpen}
				onChatBotToggle={setChatBotOpen}
				doLogout={doLogout}
			>
				<ArticlesWithSuggestedUpdates />
			</AppLayout>
		);
	}

	// Otherwise render normal app with AppLayout
	return (
		<AppLayout
			onViewChange={handleViewChange}
			chatBotOpen={chatBotOpen}
			onChatBotToggle={setChatBotOpen}
			doLogout={doLogout}
		>
			{renderViewWithFallback(activeTab, {
				Dashboard,
				Articles: Spaces,
				Sites,
				Analytics,
				Integrations,
				Settings,
				DevTools,
			})}
		</AppLayout>
	);
}

function MainElementInternal(): ReactElement {
	log.debug("MainElementInternal rendered");

	const [initLogin, setInitLogin] = useState(false);
	const [isLoadingAuth, setIsLoadingAuth] = useState(true);
	const [userInfo, setUserInfo] = useState<UserInfo | undefined>(undefined);
	const [chatBotOpen, setChatBotOpen] = useState(false);

	// Get session handlers from context.
	const { handleSessionExpired, setIdleTimeoutMs, setEnabled, dismissExpiredDialog } = useSessionTimeout();

	// Create client callbacks that will trigger session expiration
	const clientCallbacks: ClientCallbacks = useMemo(
		() => ({
			onUnauthorized: () => {
				log.info("Received 401 unauthorized response");
				handleSessionExpired();
			},
		}),
		[handleSessionExpired],
	);

	// Create client with callbacks
	const client = useMemo(() => createClient("", undefined, clientCallbacks), [clientCallbacks]);

	const doLogin = useCallback((): void => {
		client.login().then(user => {
			setUserInfo(user);
			setIsLoadingAuth(false);
		});
	}, [client]);

	const doLogout = useCallback((): void => {
		client.logout().then(() => setUserInfo(undefined));
	}, [client]);

	// Enable/disable session timeout based on login state
	useEffect(() => {
		setEnabled(!!userInfo);
	}, [userInfo, setEnabled]);

	// Fetch session config on mount
	useEffect(() => {
		client
			.auth()
			.getSessionConfig()
			.then(config => {
				log.info({ idleTimeoutMs: config.idleTimeoutMs }, "Loaded session config");
				if (config.idleTimeoutMs) {
					setIdleTimeoutMs(config.idleTimeoutMs);
				}
			})
			.catch(error => {
				log.error(error, "Failed to load session config, using default");
				// The provider will use its own default, so we don't need to set it here (\frontend\src\contexts\SessionTimeoutContext.tsx).
			});
	}, [client, setIdleTimeoutMs]);

	useEffect(() => {
		if (!initLogin) {
			doLogin();
			setInitLogin(true);
		}
		client.visit().then();
	}, [client, initLogin, doLogin]);

	// Handle re-login after session expiration
	const handleReLogin = useCallback((): void => {
		dismissExpiredDialog();
		setUserInfo(undefined);
	}, [dismissExpiredDialog]);

	// The SessionTimeoutProvider is now in the parent MainElement component
	return (
		<ClientProvider client={client} callbacks={clientCallbacks}>
			<OrgProvider>
				<TenantProvider>
					<RouterProvider>
						<DevToolsProvider>
							<NavigationProvider userInfo={userInfo}>
								<PreferencesProvider>
									<ThemeProvider>
										<MainContent
											userInfo={userInfo}
											isLoadingAuth={isLoadingAuth}
											doLogin={doLogin}
											doLogout={doLogout}
											chatBotOpen={chatBotOpen}
											setChatBotOpen={setChatBotOpen}
											onReLogin={handleReLogin}
										/>
									</ThemeProvider>
								</PreferencesProvider>
							</NavigationProvider>
						</DevToolsProvider>
					</RouterProvider>
				</TenantProvider>
			</OrgProvider>
		</ClientProvider>
	);
}

export function MainElement(): ReactElement {
	// Top-level provider for session timeout context
	// Note: We can't consume the context in the same component that provides it,
	// so we have a lightweight wrapper component.
	return (
		<SessionTimeoutProvider>
			<MainElementInternal />
		</SessionTimeoutProvider>
	);
}

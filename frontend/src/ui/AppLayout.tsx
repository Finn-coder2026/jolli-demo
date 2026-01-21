import { AppBranding } from "../components/AppBranding";
import { OrgSwitcher } from "../components/OrgSwitcher";
import { TenantSwitcher } from "../components/TenantSwitcher";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { SimpleDropdown, SimpleDropdownItem, SimpleDropdownSeparator } from "../components/ui/SimpleDropdown";
import { useNavigation } from "../contexts/NavigationContext";
import { PREFERENCES } from "../contexts/PreferencesContext";
import { useTheme } from "../contexts/ThemeContext";
import { usePreference } from "../hooks/usePreference";
import { Chatbot } from "./Chatbot";
import {
	Bell,
	LogOut,
	MessageSquare,
	Moon,
	PanelLeftClose,
	PanelLeftOpen,
	Search,
	Settings,
	Sun,
	User,
} from "lucide-react";
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

interface AppLayoutProps {
	children?: ReactNode;
	onViewChange(view: string): void;
	chatBotOpen: boolean;
	onChatBotToggle(open: boolean): void;
	doLogout(): void;
}

export function AppLayout({
	children,
	onViewChange,
	chatBotOpen,
	onChatBotToggle,
	doLogout,
}: AppLayoutProps): ReactElement {
	const content = useIntlayer("app-layout");
	const [collapsed, setCollapsed] = usePreference(PREFERENCES.sidebarCollapsed);
	const [shouldAnimate, setShouldAnimate] = useState(false);
	const [isNarrowScreen, setIsNarrowScreen] = useState(window.innerWidth < 1024);
	// Use preference for persisted value, local state for live dragging
	const [savedChatWidth, setSavedChatWidth] = usePreference(PREFERENCES.chatWidth);
	const [chatWidth, setChatWidthLocal] = useState(savedChatWidth);
	const [isResizing, setIsResizing] = useState(false);

	// Sync local chat width when preference changes (e.g., from Settings page)
	useEffect(() => {
		if (!isResizing) {
			setChatWidthLocal(savedChatWidth);
		}
	}, [savedChatWidth, isResizing]);
	const { activeTab, tabs, navigate } = useNavigation();
	const { isDarkMode, toggleTheme } = useTheme();
	const prevChatBotOpenRef = useRef(chatBotOpen);

	// Handle window resize for responsive sidebar
	useEffect(() => {
		function handleResize() {
			setIsNarrowScreen(window.innerWidth < 1024);
		}
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);

	// Auto-collapse sidebar when chat opens (only on initial open, not when toggling sidebar)
	useEffect(() => {
		// Only auto-collapse if chat just opened (transition from false to true)
		if (chatBotOpen && !prevChatBotOpenRef.current) {
			setCollapsed(true);
		}
		prevChatBotOpenRef.current = chatBotOpen;
	}, [chatBotOpen, setCollapsed]);

	function handleToggleCollapse(): void {
		const newCollapsed = !collapsed;
		if (collapsed) {
			// Expanding - enable animation
			setShouldAnimate(true);
		}
		setCollapsed(newCollapsed);
	}

	/* v8 ignore next 3 - simple wrapper function for prop callback */
	function handleChatBotClose() {
		onChatBotToggle(false);
	}

	// Handle resize drag
	const handleMouseDown = (e: React.MouseEvent) => {
		if (!isNarrowScreen) {
			e.preventDefault();
			setIsResizing(true);
		}
	};

	useEffect(() => {
		if (!isResizing) {
			return;
		}

		const handleMouseMove = (e: MouseEvent) => {
			if (!isNarrowScreen) {
				// Calculate new width based on distance from right edge
				const newWidth = window.innerWidth - e.clientX;
				// Constrain between min (300px) and max (800px)
				const constrainedWidth = Math.min(Math.max(newWidth, 300), 800);
				setChatWidthLocal(constrainedWidth);
			}
		};

		const handleMouseUp = () => {
			setIsResizing(false);
			// Save to preferences
			setSavedChatWidth(chatWidth);
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isResizing, chatWidth, isNarrowScreen, setSavedChatWidth]);

	return (
		<div className="flex h-screen overflow-hidden">
			{/* Sidebar */}
			<aside
				className={`transition-all duration-300 ${collapsed || isNarrowScreen ? "w-20" : "w-[244px]"} flex flex-col flex-shrink-0`}
				style={{ backgroundColor: "var(--sidebar-bg)", borderRight: "1px solid var(--sidebar-border)" }}
			>
				{/* Logo */}
				<AppBranding variant="sidebar" showText={!collapsed && !isNarrowScreen} animate={shouldAnimate} />

				{/* Navigation */}
				<div className="flex-1 overflow-y-auto overflow-x-hidden">
					<div className="p-2">
						{!collapsed && !isNarrowScreen && (
							<div
								className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide ${shouldAnimate ? "animate-in fade-in duration-600" : ""}`}
								style={{ color: "var(--sidebar-text-secondary)" }}
							>
								{content.navigation}
							</div>
						)}
						<nav className="space-y-1">
							{tabs.map(({ name: tabName, icon: Icon, label, badge }) => (
								<button
									key={tabName}
									onClick={() => onViewChange(tabName)}
									title={collapsed || isNarrowScreen ? label : undefined}
									className={`flex w-full items-center gap-3 rounded-md font-normal transition-colors ${
										collapsed || isNarrowScreen ? "justify-center" : ""
									}`}
									style={{
										fontSize: "14px",
										padding: "12px 16px",
										backgroundColor:
											activeTab === tabName ? "var(--sidebar-selected-bg)" : "transparent",
										color:
											activeTab === tabName
												? "var(--sidebar-selected-text)"
												: "var(--sidebar-text)",
									}}
									onMouseEnter={e => {
										if (activeTab !== tabName) {
											e.currentTarget.style.backgroundColor = "var(--sidebar-hover-bg)";
										}
									}}
									onMouseLeave={e => {
										if (activeTab !== tabName) {
											e.currentTarget.style.backgroundColor = "transparent";
										}
									}}
								>
									<Icon className="h-[16px] w-[16px] flex-shrink-0" />
									{!collapsed && !isNarrowScreen && (
										<>
											<span>{label}</span>
											{badge && (
												<Badge variant="secondary" className="ml-auto text-xs">
													{badge}
												</Badge>
											)}
										</>
									)}
								</button>
							))}
						</nav>
					</div>
				</div>
			</aside>

			{/* Main Content and Chatbot Wrapper */}
			<div className="flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden">
				{/* Main Content */}
				<div
					className={`flex flex-col overflow-hidden transition-all duration-300 flex-1 ${chatBotOpen && !isNarrowScreen ? "lg:flex-[2]" : ""}`}
				>
					{/* Header */}
					<header className="flex h-16 items-center justify-between border-b bg-card px-6">
						<div className="flex flex-1 items-center gap-3 max-w-[600px]">
							{/* Collapse button */}
							<Button
								variant="ghost"
								size="icon"
								onClick={handleToggleCollapse}
								className="hover:bg-muted rounded-lg transition-colors"
							>
								{collapsed ? (
									<PanelLeftOpen className="h-5 w-5" />
								) : (
									<PanelLeftClose className="h-5 w-5" />
								)}
							</Button>
							<div className="relative flex-1 max-w-md">
								<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									placeholder={content.searchPlaceholder.value}
									className="pl-9 bg-transparent search-input"
								/>
							</div>
						</div>

						<div className="flex items-center gap-2">
							{/* Tenant Switcher - only visible when enabled */}
							<TenantSwitcher />
							{/* Org Switcher - only visible in multi-tenant mode with multiple orgs */}
							<OrgSwitcher />

							<Button
								variant="ghost"
								size="icon"
								onClick={toggleTheme}
								className="hover:bg-muted rounded-lg transition-colors"
							>
								{isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
							</Button>

							<SimpleDropdown
								trigger={
									<Button
										variant="ghost"
										size="icon"
										className="relative hover:bg-muted rounded-lg transition-colors"
									>
										<Bell className="h-5 w-5" />
									</Button>
								}
								align="end"
							>
								<div className="p-2 text-center text-sm text-muted-foreground">
									{content.noNotifications}
								</div>
								<SimpleDropdownSeparator />
								<SimpleDropdownItem>
									<Bell className="mr-2 h-4 w-4" />
									{content.viewAllNotifications}
								</SimpleDropdownItem>
							</SimpleDropdown>

							<SimpleDropdown
								trigger={
									<Button
										variant="ghost"
										size="icon"
										className="hover:bg-muted rounded-lg transition-colors"
									>
										<User className="h-5 w-5" />
									</Button>
								}
								align="end"
							>
								<SimpleDropdownItem>
									<User className="mr-2 h-4 w-4" />
									{content.myProfile}
								</SimpleDropdownItem>
								<SimpleDropdownItem onClick={() => navigate("/settings")}>
									<Settings className="mr-2 h-4 w-4" />
									{content.settings}
								</SimpleDropdownItem>
								<SimpleDropdownSeparator />
								<SimpleDropdownItem onClick={() => doLogout()}>
									<LogOut className="mr-2 h-4 w-4" />
									{content.signOut}
								</SimpleDropdownItem>
							</SimpleDropdown>
						</div>
					</header>

					{/* Content */}
					<main className="flex-1 overflow-auto p-5 bg-background">{children}</main>
				</div>

				{/* ChatBot with Resize Handle */}
				{chatBotOpen && (
					<>
						{/* Resize Handle - only visible on wide screens */}
						{!isNarrowScreen && (
							<div
								onMouseDown={handleMouseDown}
								className="w-1 bg-border hover:bg-primary cursor-col-resize transition-colors flex-shrink-0"
								style={{
									cursor: isResizing ? "col-resize" : "ew-resize",
								}}
							/>
						)}
						<div
							style={{
								width: isNarrowScreen ? "100%" : `${chatWidth}px`,
								height: isNarrowScreen ? "50vh" : "100%",
								minHeight: isNarrowScreen ? "400px" : undefined,
							}}
						>
							<Chatbot onClose={handleChatBotClose} />
						</div>
					</>
				)}
			</div>

			{/* Floating AI Assistant Button */}
			{!chatBotOpen && (
				<button
					onClick={() => onChatBotToggle(true)}
					className="fixed bottom-12 right-12 w-14 h-14 rounded-full bg-[#5b7ee5] hover:bg-[#4a6fd4] shadow-lg transition-all duration-200 hover:scale-110 flex items-center justify-center z-50"
					style={{
						boxShadow: "0 4px 12px rgba(91, 126, 229, 0.4)",
					}}
					title={content.askAiAssistant.value}
				>
					<MessageSquare className="h-6 w-6 text-white" />
				</button>
			)}
		</div>
	);
}

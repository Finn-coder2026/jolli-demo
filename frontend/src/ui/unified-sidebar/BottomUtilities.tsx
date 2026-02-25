/**
 * BottomUtilities - Bottom section of unified sidebar with user menu, settings, and utilities.
 *
 * Features:
 * - User menu dropdown with profile and logout
 * - Settings link
 * - Dev tools link (when enabled)
 * - User context dialog (when devtools enabled)
 * - Adapts to collapsed sidebar state
 */

import { SimpleDropdown, SimpleDropdownItem, SimpleDropdownSeparator } from "../../components/ui/SimpleDropdown";
import { useDevTools } from "../../contexts/DevToolsContext";
import { useNavigation } from "../../contexts/NavigationContext";
import { useTheme } from "../../contexts/ThemeContext";
import { UserContextDialog } from "./UserContextDialog";
import type { UserInfo } from "jolli-common";
import { ChevronsUpDown, Info, LogOut, Monitor, Moon, Sun, User, Wrench } from "lucide-react";
import { type ReactElement, useState } from "react";
import { useIntlayer } from "react-intlayer";

export interface BottomUtilitiesProps {
	/** Whether the sidebar is collapsed */
	collapsed: boolean;
	/** Current user info */
	userInfo: UserInfo | undefined;
	/** Callback to handle logout */
	onLogout: () => void;
}

/**
 * Gets initials from user name or email.
 */
function getUserInitials(userInfo: UserInfo | undefined): string {
	if (!userInfo) {
		return "?";
	}
	if (userInfo.name) {
		const names = userInfo.name.split(" ");
		if (names.length >= 2) {
			return `${names[0][0]}${names[names.length - 1][0]}`.toUpperCase();
		}
		return userInfo.name.substring(0, 2).toUpperCase();
	}
	return userInfo.email.substring(0, 2).toUpperCase();
}

interface UserMenuItemsProps {
	content: ReturnType<typeof useIntlayer<"bottom-utilities">>;
	themeMode: string;
	setThemeMode: (mode: "system" | "light" | "dark") => void;
	devToolsEnabled: boolean;
	onProfileClick: () => void;
	onDevToolsClick: () => void;
	onUserContextClick: () => void;
	onLogout: () => void;
	/** Suffix appended to data-testid attributes to differentiate collapsed/expanded instances */
	testIdSuffix?: string;
}

/** Shared dropdown menu items used in both collapsed and expanded sidebar modes. */
function UserMenuItems({
	content,
	themeMode,
	setThemeMode,
	devToolsEnabled,
	onProfileClick,
	onDevToolsClick,
	onUserContextClick,
	onLogout,
	testIdSuffix = "",
}: UserMenuItemsProps): ReactElement {
	const suffix = testIdSuffix ? `-${testIdSuffix}` : "";
	return (
		<>
			<SimpleDropdownItem onClick={onProfileClick}>
				<User className="mr-2 h-4 w-4" />
				{content.myProfile}
			</SimpleDropdownItem>
			{devToolsEnabled && (
				<SimpleDropdownItem onClick={onUserContextClick} data-testid={`user-context-menu-item${suffix}`}>
					<Info className="mr-2 h-4 w-4" />
					{content.userContext}
				</SimpleDropdownItem>
			)}
			{devToolsEnabled && (
				<SimpleDropdownItem onClick={onDevToolsClick} data-testid={`devtools-menu-item${suffix}`}>
					<Wrench className="mr-2 h-4 w-4" />
					{content.devTools}
				</SimpleDropdownItem>
			)}
			<SimpleDropdownSeparator />
			<div className="relative flex items-center px-2 py-3 text-sm" data-testid="theme-selector">
				<span className="flex-1">{content.theme}</span>
				<div className="flex gap-0.5">
					<button
						type="button"
						onClick={() => setThemeMode("system")}
						className={`p-1.5 rounded hover:bg-accent transition-colors ${themeMode === "system" ? "bg-accent" : ""}`}
						title={content.systemTheme.value}
						data-testid="theme-system-button"
					>
						<Monitor className="h-4 w-4" />
					</button>
					<button
						type="button"
						onClick={() => setThemeMode("light")}
						className={`p-1.5 rounded hover:bg-accent transition-colors ${themeMode === "light" ? "bg-accent" : ""}`}
						title={content.lightMode.value}
						data-testid="theme-light-button"
					>
						<Sun className="h-4 w-4" />
					</button>
					<button
						type="button"
						onClick={() => setThemeMode("dark")}
						className={`p-1.5 rounded hover:bg-accent transition-colors ${themeMode === "dark" ? "bg-accent" : ""}`}
						title={content.darkMode.value}
						data-testid="theme-dark-button"
					>
						<Moon className="h-4 w-4" />
					</button>
				</div>
			</div>
			<SimpleDropdownSeparator />
			<SimpleDropdownItem
				onClick={onLogout}
				className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
			>
				<LogOut className="mr-2 h-4 w-4" />
				{content.signOut}
			</SimpleDropdownItem>
		</>
	);
}

/**
 * Bottom utilities section for the unified sidebar.
 * Provides user menu, settings access, and dev tools.
 *
 * @example
 * ```tsx
 * <BottomUtilities collapsed={false} userInfo={user} onLogout={handleLogout} />
 * ```
 */
export function BottomUtilities({ collapsed, userInfo, onLogout }: BottomUtilitiesProps): ReactElement {
	const content = useIntlayer("bottom-utilities");
	const { navigate } = useNavigation();
	const { devToolsEnabled } = useDevTools();
	const { themeMode, setThemeMode } = useTheme();
	const [contextDialogOpen, setContextDialogOpen] = useState(false);

	function handleDevToolsClick() {
		navigate("/devtools");
	}

	function handleProfileClick() {
		navigate("/settings/profile");
	}

	function handleUserContextClick() {
		setContextDialogOpen(true);
	}

	const userInitials = getUserInitials(userInfo);

	// Collapsed mode - show user avatar centered
	if (collapsed) {
		return (
			<div className="h-12 flex items-center justify-center px-2 shrink-0" data-testid="sidebar-bottom-section">
				{/* User menu */}
				<SimpleDropdown
					trigger={
						<button
							type="button"
							className="flex items-center justify-center p-2 rounded-md hover:bg-accent transition-colors"
							data-testid="user-menu-trigger-collapsed"
						>
							{userInfo?.picture ? (
								<img
									src={userInfo.picture}
									alt={userInfo.name || userInfo.email}
									className="h-5 w-5 rounded-full shrink-0"
									data-testid="user-avatar-collapsed"
								/>
							) : (
								<div
									className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium shrink-0"
									data-testid="user-initials-collapsed"
								>
									{userInitials}
								</div>
							)}
						</button>
					}
					align="start"
					position="above"
					className="w-[240px] left-full ml-2"
				>
					<UserMenuItems
						content={content}
						themeMode={themeMode}
						setThemeMode={setThemeMode}
						devToolsEnabled={devToolsEnabled}
						onProfileClick={handleProfileClick}
						onDevToolsClick={handleDevToolsClick}
						onUserContextClick={handleUserContextClick}
						onLogout={onLogout}
						testIdSuffix="collapsed"
					/>
				</SimpleDropdown>
				<UserContextDialog open={contextDialogOpen} onOpenChange={setContextDialogOpen} />
			</div>
		);
	}

	// Expanded mode - show user menu
	return (
		<div className="h-12 flex items-center px-2 shrink-0" data-testid="sidebar-bottom-section">
			{/* User menu - wrapper needed for full width */}
			<div className="w-full">
				<SimpleDropdown
					trigger={
						<button
							type="button"
							className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm hover:bg-sidebar-accent transition-colors"
							data-testid="user-menu-trigger-expanded"
						>
							{userInfo?.picture ? (
								<img
									src={userInfo.picture}
									alt={userInfo.name || userInfo.email}
									className="h-6 w-6 rounded-full shrink-0"
									data-testid="user-avatar-expanded"
								/>
							) : (
								<div
									className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium shrink-0"
									data-testid="user-initials-expanded"
								>
									{userInitials}
								</div>
							)}
							<span className="flex-1 text-left truncate font-semibold text-sidebar-foreground">
								{userInfo?.name || userInfo?.email || "User"}
							</span>
							<ChevronsUpDown className="h-4 w-4 ml-auto opacity-50 shrink-0" />
						</button>
					}
					align="start"
					position="above"
					className="w-[240px]"
				>
					<UserMenuItems
						content={content}
						themeMode={themeMode}
						setThemeMode={setThemeMode}
						devToolsEnabled={devToolsEnabled}
						onProfileClick={handleProfileClick}
						onDevToolsClick={handleDevToolsClick}
						onUserContextClick={handleUserContextClick}
						onLogout={onLogout}
					/>
				</SimpleDropdown>
			</div>
			<UserContextDialog open={contextDialogOpen} onOpenChange={setContextDialogOpen} />
		</div>
	);
}

/**
 * PreferencesPage - Application preferences settings.
 *
 * Contains:
 * - Appearance settings (theme, language)
 * - Interface settings (sidebar, chat width)
 * - Articles settings (draft filter, tool details)
 *
 * This content was moved from the original Settings.tsx component.
 */

import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { LanguageSwitcher } from "../../components/ui/LanguageSwitcher";
import { NativeSelect } from "../../components/ui/NativeSelect";
import { PREFERENCES } from "../../contexts/PreferencesContext";
import { useTheme } from "../../contexts/ThemeContext";
import { usePreference } from "../../hooks/usePreference";
import { SettingsRow, SettingsSection } from "./SettingsSection";
import type { DraftListFilter } from "jolli-common";
import { Moon, Sun } from "lucide-react";
import { type ReactElement, useState } from "react";
import { useIntlayer } from "react-intlayer";

/**
 * Preferences page component.
 *
 * Provides user preferences and application settings.
 */
export function PreferencesPage(): ReactElement {
	const content = useIntlayer("settings");
	const pageContent = useIntlayer("preferences-page");
	const { isDarkMode, setThemeMode } = useTheme();
	const toggleTheme = () => setThemeMode(isDarkMode ? "light" : "dark");

	// Preferences
	const [sidebarCollapsed, setSidebarCollapsed] = usePreference(PREFERENCES.sidebarCollapsed);
	const [chatWidth, setChatWidth] = usePreference(PREFERENCES.chatWidth);
	const [draftFilter, setDraftFilter] = usePreference(PREFERENCES.articlesDraftFilter);
	const [showToolDetails, setShowToolDetails] = usePreference(PREFERENCES.articleDraftShowToolDetails);

	// Local state for chat width input (to avoid saving on every keystroke)
	const [chatWidthInput, setChatWidthInput] = useState(String(chatWidth));

	/* v8 ignore start - blur handler tested via fireEvent but v8 coverage doesn't track event handler execution */
	function handleChatWidthBlur(): void {
		const value = Number.parseInt(chatWidthInput, 10);
		if (!Number.isNaN(value) && value >= 300 && value <= 800) {
			setChatWidth(value);
		} else {
			// Reset to current valid value
			setChatWidthInput(String(chatWidth));
		}
	}
	/* v8 ignore stop */

	return (
		<div className="space-y-8" data-testid="preferences-page">
			<div>
				<h1 className="text-2xl font-semibold mb-2">{pageContent.title.value}</h1>
				<p className="text-muted-foreground">{pageContent.subtitle.value}</p>
			</div>

			{/* Appearance Section */}
			<SettingsSection title={content.appearanceTitle.value} description={content.appearanceDescription.value}>
				<SettingsRow label={content.themeLabel.value} description={content.themeDescription.value}>
					<Button
						variant="outline"
						size="sm"
						onClick={toggleTheme}
						className="flex items-center gap-2 min-w-[100px]"
						data-testid="theme-toggle"
					>
						{isDarkMode ? (
							<>
								<Moon className="h-4 w-4" />
								{content.themeDark}
							</>
						) : (
							<>
								<Sun className="h-4 w-4" />
								{content.themeLight}
							</>
						)}
					</Button>
				</SettingsRow>

				<SettingsRow label={content.languageTitle.value} description={content.languageDescription.value}>
					<LanguageSwitcher />
				</SettingsRow>
			</SettingsSection>

			{/* Interface Section */}
			<SettingsSection title={content.interfaceTitle.value} description={content.interfaceDescription.value}>
				<SettingsRow label={content.sidebarLabel.value} description={content.sidebarDescription.value}>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
						className="min-w-[100px]"
						data-testid="sidebar-toggle"
					>
						{sidebarCollapsed ? content.sidebarCollapsed : content.sidebarExpanded}
					</Button>
				</SettingsRow>

				<SettingsRow label={content.chatWidthLabel.value} description={content.chatWidthDescription.value}>
					<Input
						type="number"
						min={300}
						max={800}
						value={chatWidthInput}
						onChange={e => setChatWidthInput(e.currentTarget.value)}
						onBlur={handleChatWidthBlur}
						className="w-24 text-right"
						data-testid="chat-width-input"
					/>
				</SettingsRow>
			</SettingsSection>

			{/* Articles Section */}
			<SettingsSection title={content.articlesTitle.value} description={content.articlesDescription.value}>
				<SettingsRow label={content.draftFilterLabel.value} description={content.draftFilterDescription.value}>
					<NativeSelect
						value={draftFilter}
						onChange={e => setDraftFilter(e.currentTarget.value as DraftListFilter)}
						className="min-w-[160px]"
						data-testid="draft-filter-select"
					>
						<option value="all">{content.draftFilterAll}</option>
						<option value="my-new-drafts">{content.draftFilterMyNew}</option>
						<option value="shared-with-me">{content.draftFilterShared}</option>
						<option value="suggested-updates">{content.draftFilterSuggested}</option>
					</NativeSelect>
				</SettingsRow>

				<SettingsRow
					label={content.showToolDetailsLabel.value}
					description={content.showToolDetailsDescription.value}
				>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShowToolDetails(!showToolDetails)}
						className="min-w-[80px]"
						data-testid="tool-details-toggle"
					>
						{showToolDetails ? "On" : "Off"}
					</Button>
				</SettingsRow>
			</SettingsSection>
		</div>
	);
}

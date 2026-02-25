import { Input } from "../components/ui/Input";
import { LanguageSwitcher } from "../components/ui/LanguageSwitcher";
import { SettingsRow, SettingsSection } from "./settings/SettingsSection";
import type { UserInfo } from "jolli-common";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface ProfileProps {
	/** Current user info */
	userInfo?: UserInfo;
}

/**
 * Profile page - displays and allows editing of user information.
 *
 * Shows:
 * - Personal information (name, email)
 * - Language preferences
 */
export function Profile({ userInfo }: ProfileProps): ReactElement {
	const content = useIntlayer("profile");

	return (
		<div className="bg-card rounded-lg p-6 border h-full overflow-auto scrollbar-thin">
			<div className="mb-8">
				<h1 className="text-2xl font-semibold mb-2">{content.title}</h1>
				<p className="text-muted-foreground">{content.subtitle}</p>
			</div>

			<div className="space-y-8 max-w-2xl">
				{/* Personal Information Section */}
				<SettingsSection
					title={content.personalInfoTitle.value}
					description={content.personalInfoDescription.value}
				>
					<SettingsRow label={content.nameLabel.value} description={content.nameDescription.value}>
						<Input value={userInfo?.name} disabled className="max-w-xs" />
					</SettingsRow>

					<SettingsRow label={content.emailLabel.value} description={content.emailDescription.value}>
						<Input value={userInfo?.email} disabled className="max-w-xs" />
					</SettingsRow>
				</SettingsSection>

				{/* Language Section */}
				<SettingsSection title={content.languageTitle.value} description={content.languageDescription.value}>
					<LanguageSwitcher />
				</SettingsSection>
			</div>
		</div>
	);
}

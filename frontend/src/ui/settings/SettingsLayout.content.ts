/**
 * Localization content for SettingsLayout and SettingsSidebar.
 */

import { type Dictionary, t } from "intlayer";

const settingsLayoutContent = {
	key: "settings-layout",
	content: {
		// Back link
		backToApp: t({
			en: "Back to App",
			es: "Volver a la App",
		}),

		// Section titles
		sectionPersonal: t({
			en: "Personal",
			es: "Personal",
		}),
		sectionAccount: t({
			en: "Account",
			es: "Cuenta",
		}),

		// Navigation items
		navProfile: t({
			en: "Profile",
			es: "Perfil",
		}),
		navPreferences: t({
			en: "Preferences",
			es: "Preferencias",
		}),
		navUsers: t({
			en: "Users",
			es: "Usuarios",
		}),
		navRoles: t({
			en: "Roles",
			es: "Roles",
		}),
		navSources: t({
			en: "Sources",
			es: "Fuentes",
		}),
	},
} satisfies Dictionary;

export default settingsLayoutContent;

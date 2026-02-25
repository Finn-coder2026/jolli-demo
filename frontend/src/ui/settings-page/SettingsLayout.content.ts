import { type Dictionary, t } from "intlayer";

const settingsLayoutContent = {
	key: "settings-layout",
	content: {
		backToApp: t({ en: "Back to App", es: "Volver a la App" }),

		// Personal section
		personalSection: t({ en: "Personal", es: "Personal" }),
		profileNav: t({ en: "Profile", es: "Perfil" }),
		preferencesNav: t({ en: "Preferences", es: "Preferencias" }),

		// Account section
		accountSection: t({ en: "Account", es: "Cuenta" }),
		usersNav: t({ en: "Users", es: "Usuarios" }),
		sourcesNav: t({ en: "Sources", es: "Fuentes" }),

		// Sidebar toggle
		collapseSidebar: t({ en: "Collapse sidebar", es: "Contraer barra lateral" }),
		expandSidebar: t({ en: "Expand sidebar", es: "Expandir barra lateral" }),
	},
} satisfies Dictionary;

export default settingsLayoutContent;

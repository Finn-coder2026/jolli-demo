import { type Dictionary, t } from "intlayer";

const appLayoutContent = {
	key: "app-layout",
	content: {
		navigation: t({
			en: "Navigation",
			es: "Navegación",
		}),
		// Navigation tab labels
		tabInbox: t({
			en: "Inbox",
			es: "Bandeja de entrada",
		}),
		tabDashboard: t({
			en: "Dashboard",
			es: "Panel",
		}),
		tabArticles: t({
			en: "Articles",
			es: "Artículos",
		}),
		tabSites: t({
			en: "Sites",
			es: "Sitios",
		}),
		tabAnalytics: t({
			en: "Analytics",
			es: "Analíticas",
		}),
		tabIntegrations: t({
			en: "Sources",
			es: "Fuentes",
		}),
		tabUsers: t({
			en: "Users",
			es: "Usuarios",
		}),
		tabRoles: t({
			en: "Roles",
			es: "Roles",
		}),
		tabSettings: t({
			en: "Settings",
			es: "Ajustes",
		}),
		tabDevTools: t({
			en: "Dev Tools",
			es: "Desarrollo",
		}),
	},
} satisfies Dictionary;

export default appLayoutContent;

import { type Dictionary, t } from "intlayer";

const appLayoutContent = {
	key: "app-layout",
	content: {
		navigation: t({
			en: "Navigation",
			es: "Navegación",
		}),
		// Navigation tab labels
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
		tabSettings: t({
			en: "Settings",
			es: "Ajustes",
		}),
		tabDevTools: t({
			en: "Dev Tools",
			es: "Desarrollo",
		}),
		searchPlaceholder: t({
			en: "Search articles...",
			es: "Buscar artículos...",
		}),
		noNotifications: t({
			en: "No new notifications",
			es: "No hay notificaciones nuevas",
		}),
		viewAllNotifications: t({
			en: "View all notifications",
			es: "Ver todas las notificaciones",
		}),
		myProfile: t({
			en: "My Profile",
			es: "Mi Perfil",
		}),
		settings: t({
			en: "Settings",
			es: "Configuración",
		}),
		signOut: t({
			en: "Sign Out",
			es: "Cerrar Sesión",
		}),
		askAiAssistant: t({
			en: "Ask AI Assistant",
			es: "Preguntar al Asistente IA",
		}),
	},
} satisfies Dictionary;

export default appLayoutContent;

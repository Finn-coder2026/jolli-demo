import { type DeclarationContent, t } from "intlayer";

const unifiedSidebarContent = {
	key: "unified-sidebar",
	content: {
		ariaLabel: t({
			en: "Main navigation sidebar",
			es: "Barra lateral de navegación principal",
		}),
		navigation: t({
			en: "Navigation",
			es: "Navegación",
		}),
		mainNavigation: t({
			en: "Main navigation",
			es: "Navegación principal",
		}),
		inbox: t({
			en: "Inbox",
			es: "Bandeja de entrada",
		}),
		dashboard: t({
			en: "Dashboard",
			es: "Tablero",
		}),
		expandSidebar: t({
			en: "Expand sidebar",
			es: "Expandir barra lateral",
		}),
		collapseSidebar: t({
			en: "Collapse sidebar",
			es: "Contraer barra lateral",
		}),
	},
} satisfies DeclarationContent;

export default unifiedSidebarContent;

import { type Dictionary, t } from "intlayer";

const unifiedSidebarContent = {
	key: "unified-sidebar",
	content: {
		agent: t({
			en: "Jolli Agent",
			es: "Agente Jolli",
		}),
		personalSpace: t({
			en: "Personal Space",
			es: "Espacio Personal",
		}),
		settings: t({
			en: "Settings",
			es: "Configuración",
		}),
		collapseSidebar: t({
			en: "Collapse sidebar",
			es: "Contraer barra lateral",
		}),
		expandSidebar: t({
			en: "Expand sidebar",
			es: "Expandir barra lateral",
		}),
	},
} satisfies Dictionary;

export default unifiedSidebarContent;

import { type Dictionary, t } from "intlayer";

const siteTreeNavContent = {
	key: "site-tree-nav",
	content: {
		siteSettingsLabel: t({
			en: "Site",
			es: "Sitio",
		}),
		navigationTab: t({
			en: "Navigation",
			es: "Navegación",
		}),
		navigationTooltip: t({
			en: "Edit sidebar navigation structure",
			es: "Editar estructura de navegación lateral",
		}),
		contentTab: t({
			en: "Content",
			es: "Contenido",
		}),
		contentTooltip: t({
			en: "Select articles to include in this site",
			es: "Seleccionar artículos para incluir en este sitio",
		}),
		brandingTab: t({
			en: "Branding",
			es: "Marca",
		}),
		brandingTooltip: t({
			en: "Customize theme, colors, and logo",
			es: "Personalizar tema, colores y logotipo",
		}),
		settingsTab: t({
			en: "Settings",
			es: "Configuración",
		}),
		settingsTooltip: t({
			en: "Authentication and site settings",
			es: "Autenticación y configuración del sitio",
		}),
		collapsePanel: t({
			en: "Collapse panel",
			es: "Colapsar panel",
		}),
	},
} satisfies Dictionary;

export default siteTreeNavContent;

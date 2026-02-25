import { type Dictionary, t } from "intlayer";

const siteSettingsContent = {
	key: "site-settings",
	content: {
		siteSettingsTitle: t({
			en: "Settings",
			es: "Configuración",
		}),
		generalTab: t({
			en: "General",
			es: "General",
		}),
		siteNotFound: t({
			en: "Site not found",
			es: "Sitio no encontrado",
		}),
		loading: t({
			en: "Loading...",
			es: "Cargando...",
		}),
	},
} satisfies Dictionary;

export default siteSettingsContent;

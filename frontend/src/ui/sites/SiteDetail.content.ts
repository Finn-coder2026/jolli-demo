import { type Dictionary, t } from "intlayer";

const siteDetailContent = {
	key: "site-detail",
	content: {
		addToFavorites: t({
			en: "Add to favorites",
			es: "Agregar a favoritos",
		}),
		cancelBuildButton: t({
			en: "Cancel Build",
			es: "Cancelar Construcción",
		}),
		removeFromFavorites: t({
			en: "Remove from favorites",
			es: "Quitar de favoritos",
		}),
		viewSite: t({
			en: "View Site",
			es: "Ver Sitio",
		}),
		loading: t({
			en: "Loading...",
			es: "Cargando...",
		}),
		notFound: t({
			en: "Site not found",
			es: "Sitio no encontrado",
		}),
		expandPanel: t({
			en: "Expand panel",
			es: "Expandir panel",
		}),
	},
} satisfies Dictionary;

export default siteDetailContent;

import { type Dictionary, t } from "intlayer";

const sitesFavoritesListContent = {
	key: "sites-favorites-list",
	content: {
		sites: t({
			en: "Sites",
			es: "Sitios",
		}),
		viewInBrowser: t({
			en: "View in browser",
			es: "Ver en el navegador",
		}),
		noFavorites: t({
			en: "No favorite sites yet",
			es: "Aún no hay sitios favoritos",
		}),
		noFavoritesHint: t({
			en: "Star sites to add them here",
			es: "Marca sitios como favoritos para agregarlos aquí",
		}),
		expandSection: t({
			en: "Expand sites section",
			es: "Expandir sección de sitios",
		}),
		collapseSection: t({
			en: "Collapse sites section",
			es: "Contraer sección de sitios",
		}),
		removeFromFavorites: t({
			en: "Remove from favorites",
			es: "Quitar de favoritos",
		}),
		searchSites: t({
			en: "Search sites...",
			es: "Buscar sitios...",
		}),
		allSites: t({
			en: "All Sites",
			es: "Todos los Sitios",
		}),
		noSites: t({
			en: "No sites available",
			es: "No hay sitios disponibles",
		}),
		emptyStateMessage: t({
			en: "Get started by creating your first site",
			es: "Comienza creando tu primer sitio",
		}),
		createSiteButton: t({
			en: "Create Site",
			es: "Crear Sitio",
		}),
		noResults: t({
			en: "No sites found",
			es: "No se encontraron sitios",
		}),
		addToFavorites: t({
			en: "Add to favorites",
			es: "Agregar a favoritos",
		}),
		viewAllSites: t({
			en: "View All Sites",
			es: "Ver Todos los Sitios",
		}),
		openInNewTab: t({
			en: "Open in new tab",
			es: "Abrir en nueva pestaña",
		}),
		createSite: t({
			en: "Create new site",
			es: "Crear nuevo sitio",
		}),
		siteNotAvailable: t({
			en: "Site not yet available",
			es: "Sitio aún no disponible",
		}),
	},
} satisfies Dictionary;

export default sitesFavoritesListContent;

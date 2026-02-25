import { type Dictionary, t } from "intlayer";

const spacesFavoritesListContent = {
	key: "spaces-favorites-list",
	content: {
		spaces: t({
			en: "Company Spaces",
			es: "Espacios de la Empresa",
		}),
		createSpace: t({
			en: "Create space",
			es: "Crear espacio",
		}),
		viewAllSpaces: t({
			en: "View All Spaces",
			es: "Ver Todos los Espacios",
		}),
		noFavorites: t({
			en: "No favorite spaces yet",
			es: "Aún no hay espacios favoritos",
		}),
		noFavoritesHint: t({
			en: "Star spaces to add them here",
			es: "Marca espacios como favoritos para agregarlos aquí",
		}),
		expandSection: t({
			en: "Expand spaces section",
			es: "Expandir sección de espacios",
		}),
		collapseSection: t({
			en: "Collapse spaces section",
			es: "Contraer sección de espacios",
		}),
		removeFromFavorites: t({
			en: "Remove from favorites",
			es: "Quitar de favoritos",
		}),
		searchSpaces: t({
			en: "Search spaces...",
			es: "Buscar espacios...",
		}),
		allSpaces: t({
			en: "All Company Spaces",
			es: "Todos los Espacios de la Empresa",
		}),
		noSpaces: t({
			en: "No spaces available",
			es: "No hay espacios disponibles",
		}),
		emptyStateMessage: t({
			en: "Get started by creating your first space",
			es: "Comienza creando tu primer espacio",
		}),
		createSpaceButton: t({
			en: "Create Space",
			es: "Crear Espacio",
		}),
		noResults: t({
			en: "No spaces found",
			es: "No se encontraron espacios",
		}),
		addToFavorites: t({
			en: "Add to favorites",
			es: "Agregar a favoritos",
		}),
	},
} satisfies Dictionary;

export default spacesFavoritesListContent;

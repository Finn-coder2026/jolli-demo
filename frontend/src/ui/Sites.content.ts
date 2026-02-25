import { type Dictionary, t } from "intlayer";

const sitesContent = {
	key: "sites",
	content: {
		title: t({
			en: "Sites",
			es: "Sitios",
		}),
		createButton: t({
			en: "Create New Site",
			es: "Crear Nuevo Sitio",
		}),
		emptyStateTitle: t({
			en: "No sites yet",
			es: "No hay sitios aún",
		}),
		emptyStateDescription: t({
			en: "Create your first documentation site from your articles",
			es: "Crea tu primer sitio de documentación desde tus artículos",
		}),
		// Card fields
		siteName: t({
			en: "Site Name",
			es: "Nombre del Sitio",
		}),
		displayName: t({
			en: "Display Name",
			es: "Nombre de Visualización",
		}),
		status: t({
			en: "Status",
			es: "Estado",
		}),
		visibility: t({
			en: "Visibility",
			es: "Visibilidad",
		}),
		githubRepo: t({
			en: "GitHub Repository",
			es: "Repositorio GitHub",
		}),
		vercelUrl: t({
			en: "Vercel URL",
			es: "URL de Vercel",
		}),
		lastUpdated: t({
			en: "Last Updated",
			es: "Última Actualización",
		}),
		articleCount: t({
			en: "Articles",
			es: "Artículos",
		}),
		updateAvailable: t({
			en: "Update Available",
			es: "Actualización Disponible",
		}),
		// Status values
		statusPending: t({
			en: "Pending",
			es: "Pendiente",
		}),
		statusBuilding: t({
			en: "Building",
			es: "Construyendo",
		}),
		statusActive: t({
			en: "Active",
			es: "Activo",
		}),
		statusError: t({
			en: "Error",
			es: "Error",
		}),
		// Visibility values
		visibilityInternal: t({
			en: "Internal",
			es: "Interno",
		}),
		visibilityExternal: t({
			en: "External",
			es: "Externo",
		}),
		// Protection values
		protectionProtected: t({
			en: "Protected",
			es: "Protegido",
		}),
		protectionPublic: t({
			en: "Public",
			es: "Público",
		}),
		// Actions
		viewDetails: t({
			en: "View Details",
			es: "Ver Detalles",
		}),
		viewSite: t({
			en: "View Site",
			es: "Ver Sitio",
		}),
		viewRepo: t({
			en: "View Repository",
			es: "Ver Repositorio",
		}),
		favorite: t({
			en: "Favorite",
			es: "Favorito",
		}),
		favorited: t({
			en: "Favorited",
			es: "Favorito",
		}),
		addFavorite: t({
			en: "Add to favorites",
			es: "Añadir a favoritos",
		}),
		removeFavorite: t({
			en: "Remove from favorites",
			es: "Quitar de favoritos",
		}),
		loading: t({
			en: "Loading sites...",
			es: "Cargando sitios...",
		}),
	},
} satisfies Dictionary;

export default sitesContent;

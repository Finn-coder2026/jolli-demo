import { type Dictionary, insert, t } from "intlayer";

// Note: Some strings (change type badges, status labels) are intentionally duplicated
// across SitePendingChangesTab and SiteRebuildIndicator content files.
// Intlayer requires each dictionary to be self-contained.
const sitePendingChangesTabContent = {
	key: "site-pending-changes-tab",
	content: {
		title: t({
			en: "Pending Changes",
			es: "Cambios Pendientes",
		}),
		description: t({
			en: insert("Review {{count}} pending changes before publishing."),
			es: insert("Revisa {{count}} cambios pendientes antes de publicar."),
		}),

		noChangesTitle: t({
			en: "All up to date",
			es: "Todo actualizado",
		}),
		noChangesDescription: t({
			en: "Your site is up to date. Any changes you make will appear here for review before publishing.",
			es: "Tu sitio está actualizado. Los cambios que hagas aparecerán aquí para revisar antes de publicar.",
		}),

		buildingTitle: t({
			en: "Publishing in progress",
			es: "Publicación en progreso",
		}),
		buildingDescription: t({
			en: "Your site is being published with the latest changes. This may take a few moments.",
			es: "Tu sitio se está publicando con los últimos cambios. Esto puede tardar unos momentos.",
		}),

		brandingChanges: t({
			en: "Branding",
			es: "Marca",
		}),
		brandingChangedDescription: t({
			en: "Logo, colors, or theme settings have been modified.",
			es: "El logo, colores o configuración de tema han sido modificados.",
		}),
		folderStructureChanges: t({
			en: "Navigation Structure",
			es: "Estructura de Navegación",
		}),
		folderStructureChangedDescription: t({
			en: "The folder-based navigation structure setting has been changed.",
			es: "La configuración de estructura de navegación basada en carpetas ha cambiado.",
		}),
		authChanges: t({
			en: "Authentication",
			es: "Autenticación",
		}),
		authEnabled: t({
			en: "Enabled",
			es: "Habilitado",
		}),
		authDisabled: t({
			en: "Disabled",
			es: "Deshabilitado",
		}),
		configChanges: t({
			en: "Configuration Files",
			es: "Archivos de Configuración",
		}),
		articleChanges: t({
			en: "Articles",
			es: "Artículos",
		}),

		changeNew: t({
			en: "New",
			es: "Nuevo",
		}),
		changeUpdated: t({
			en: "Updated",
			es: "Actualizado",
		}),
		changeDeleted: t({
			en: "Deleted",
			es: "Eliminado",
		}),

		newArticles: t({
			en: "New Articles",
			es: "Artículos Nuevos",
		}),
		updatedArticles: t({
			en: "Updated Articles",
			es: "Artículos Actualizados",
		}),
		deletedArticles: t({
			en: "Deleted Articles",
			es: "Artículos Eliminados",
		}),

		reasonContent: t({
			en: "Content changed",
			es: "Contenido modificado",
		}),
		reasonSelection: t({
			en: "Selection changed",
			es: "Selección modificada",
		}),
		reasonConfig: t({
			en: "Configuration changed",
			es: "Configuración modificada",
		}),

		publishNow: t({
			en: "Publish Changes",
			es: "Publicar Cambios",
		}),
		publishing: t({
			en: "Publishing...",
			es: "Publicando...",
		}),
		savingChanges: t({
			en: "Saving changes...",
			es: "Guardando cambios...",
		}),
		unsavedChangesNote: t({
			en: "Please wait for changes to be saved before publishing.",
			es: "Por favor espera a que los cambios se guarden antes de publicar.",
		}),
	},
} satisfies Dictionary;

export default sitePendingChangesTabContent;

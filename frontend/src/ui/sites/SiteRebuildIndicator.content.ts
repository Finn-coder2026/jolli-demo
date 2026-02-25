import { type Dictionary, insert, t } from "intlayer";

// Note: Some strings (change type badges, status labels) are intentionally duplicated
// across SiteRebuildIndicator and SitePendingChangesTab content files.
// Intlayer requires each dictionary to be self-contained.
const siteRebuildIndicatorContent = {
	key: "site-rebuild-indicator",
	content: {
		building: t({
			en: "Publishing...",
			es: "Publicando...",
		}),
		upToDate: t({
			en: "Up to date",
			es: "Actualizado",
		}),
		changesAvailable: t({
			en: "Pending changes",
			es: "Cambios pendientes",
		}),
		buildError: t({
			en: "Build error",
			es: "Error de construcción",
		}),

		pendingChangesTitle: t({
			en: "Pending Changes",
			es: "Cambios Pendientes",
		}),
		pendingChangesDescription: t({
			en: "These changes will be applied when you publish.",
			es: "Estos cambios se aplicarán cuando publiques.",
		}),
		buildErrorTitle: t({
			en: "Build Failed",
			es: "Construcción Fallida",
		}),
		buildErrorDescription: t({
			en: "The last build encountered an error.",
			es: "La última construcción encontró un error.",
		}),

		brandingChanged: t({
			en: "Branding settings changed",
			es: "Configuración de marca cambiada",
		}),
		folderStructureChanged: t({
			en: "Navigation structure changed",
			es: "Estructura de navegación cambiada",
		}),
		authChanged: t({
			en: "Authentication",
			es: "Autenticación",
		}),
		enabled: t({
			en: "enabled",
			es: "habilitado",
		}),
		disabled: t({
			en: "disabled",
			es: "deshabilitado",
		}),
		configChanges: t({
			en: "Config Changes",
			es: "Cambios de Configuración",
		}),
		articleChanges: t({
			en: "Article Changes",
			es: "Cambios de Artículos",
		}),

		new: t({
			en: "New",
			es: "Nuevo",
		}),
		updated: t({
			en: "Updated",
			es: "Actualizado",
		}),
		deleted: t({
			en: "Deleted",
			es: "Eliminado",
		}),
		andMore: t({
			en: insert("...and {{count}} more"),
			es: insert("...y {{count}} más"),
		}),

		errorDetails: t({
			en: "Error Details",
			es: "Detalles del Error",
		}),

		rebuildNow: t({
			en: "Publish",
			es: "Publicar",
		}),
		rebuilding: t({
			en: "Publishing...",
			es: "Publicando...",
		}),
		savingChanges: t({
			en: "Saving changes...",
			es: "Guardando cambios...",
		}),
		reviewAll: t({
			en: "Review all changes",
			es: "Revisar todos los cambios",
		}),
	},
} satisfies Dictionary;

export default siteRebuildIndicatorContent;

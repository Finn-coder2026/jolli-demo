import { type Dictionary, t } from "intlayer";

const siteSettingsTabContent = {
	key: "site-settings-tab",
	content: {
		title: t({
			en: "Settings",
			es: "Configuración",
		}),
		// Site Info section
		siteInfoTitle: t({
			en: "Site Information",
			es: "Información del Sitio",
		}),
		siteInfoDescription: t({
			en: "Overview of your site's status and key metrics",
			es: "Resumen del estado y métricas clave de tu sitio",
		}),
		previewLabel: t({
			en: "Preview",
			es: "Vista Previa",
		}),
		statsLabel: t({
			en: "Statistics",
			es: "Estadísticas",
		}),
		statusLabel: t({
			en: "Status",
			es: "Estado",
		}),
		articlesLabel: t({
			en: "Articles",
			es: "Artículos",
		}),
		lastBuiltLabel: t({
			en: "Last Built",
			es: "Última Construcción",
		}),
		createdLabel: t({
			en: "Created",
			es: "Creado",
		}),
		copyUrl: t({
			en: "Copy URL",
			es: "Copiar URL",
		}),
		openSite: t({
			en: "Open site in new tab",
			es: "Abrir sitio en nueva pestaña",
		}),
		statusActive: t({
			en: "Active",
			es: "Activo",
		}),
		statusBuilding: t({
			en: "Building",
			es: "Construyendo",
		}),
		statusPending: t({
			en: "Pending",
			es: "Pendiente",
		}),
		statusError: t({
			en: "Error",
			es: "Error",
		}),
		// Authentication section
		authenticationTitle: t({
			en: "Authentication",
			es: "Autenticación",
		}),
		authenticationDescription: t({
			en: "Control who can access your documentation site",
			es: "Controla quién puede acceder a tu sitio de documentación",
		}),
		saving: t({
			en: "Saving...",
			es: "Guardando...",
		}),
		authRebuildNote: t({
			en: "Authentication changes require publishing the site to take effect.",
			es: "Los cambios de autenticación requieren publicar el sitio para aplicarse.",
		}),
		// Access options for card-based UI
		accessPublicTitle: t({
			en: "Public",
			es: "Público",
		}),
		accessPublicDescription: t({
			en: "Anyone with the link can view your documentation site.",
			es: "Cualquiera con el enlace puede ver tu sitio de documentación.",
		}),
		accessRestrictedTitle: t({
			en: "Restricted to Jolli users",
			es: "Restringido a usuarios de Jolli",
		}),
		accessRestrictedDescription: t({
			en: "Only users with a Jolli account in your organization can access this site.",
			es: "Solo usuarios con una cuenta de Jolli en tu organización pueden acceder a este sitio.",
		}),
		accessRestrictedNote: t({
			en: "Visitors will need to sign in with their Jolli account to view the site.",
			es: "Los visitantes necesitarán iniciar sesión con su cuenta de Jolli para ver el sitio.",
		}),
		// Domain section
		domainTitle: t({
			en: "Custom Domain",
			es: "Dominio Personalizado",
		}),
		domainDescription: t({
			en: "Connect your own domain to this documentation site",
			es: "Conecta tu propio dominio a este sitio de documentación",
		}),
		currentDomain: t({
			en: "Current Domain",
			es: "Dominio Actual",
		}),
		defaultDomain: t({
			en: "Default Domain",
			es: "Dominio Predeterminado",
		}),
		hideDomainManager: t({
			en: "Hide",
			es: "Ocultar",
		}),
		manageDomain: t({
			en: "Manage",
			es: "Administrar",
		}),
		addDomain: t({
			en: "Add Domain",
			es: "Agregar Dominio",
		}),
		// Danger zone
		dangerZoneTitle: t({
			en: "Danger Zone",
			es: "Zona de Peligro",
		}),
		dangerZoneDescription: t({
			en: "Irreversible actions that affect your site",
			es: "Acciones irreversibles que afectan tu sitio",
		}),
		deleteSiteLabel: t({
			en: "Delete this site",
			es: "Eliminar este sitio",
		}),
		deleteSiteButton: t({
			en: "Delete",
			es: "Eliminar",
		}),
		deleteSiteDescription: t({
			en: "Permanently remove this site and all associated resources",
			es: "Eliminar permanentemente este sitio y todos los recursos asociados",
		}),
		deleteConfirmWarning: t({
			en: "This action cannot be undone.",
			es: "Esta acción no se puede deshacer.",
		}),
		// Delete confirmation
		cancelButton: t({
			en: "Cancel",
			es: "Cancelar",
		}),
		deletingButton: t({
			en: "Deleting...",
			es: "Eliminando...",
		}),
		deletePermanentlyButton: t({
			en: "Delete Permanently",
			es: "Eliminar Permanentemente",
		}),
		deleteFailedMessage: t({
			en: "Failed to delete site. Please try again.",
			es: "Error al eliminar el sitio. Inténtalo de nuevo.",
		}),
		authUpdateFailedMessage: t({
			en: "Failed to update authentication settings. Please try again.",
			es: "Error al actualizar la configuración de autenticación. Inténtalo de nuevo.",
		}),
		folderStructureUpdateFailedMessage: t({
			en: "Failed to update navigation structure. Please try again.",
			es: "Error al actualizar la estructura de navegación. Inténtalo de nuevo.",
		}),
		// Folder structure
		folderStructureTitle: t({
			en: "Navigation Structure",
			es: "Estructura de Navegación",
		}),
		folderStructureDescription: t({
			en: "Choose how the site navigation is organized",
			es: "Elige cómo se organiza la navegación del sitio",
		}),
		useSpaceFolderStructureLabel: t({
			en: "Auto-sync navigation from spaces",
			es: "Sincronizar navegación desde espacios",
		}),
		useSpaceFolderStructureDescription: t({
			en: "Navigation is automatically derived from how articles are organized in your spaces. When disabled, you can edit the navigation manually.",
			es: "La navegación se deriva automáticamente de cómo están organizados los artículos en tus espacios. Cuando está desactivado, puedes editar la navegación manualmente.",
		}),
		folderStructureRebuildNote: t({
			en: "Changes take effect after publishing.",
			es: "Los cambios se aplican después de publicar.",
		}),
	},
} satisfies Dictionary;

export default siteSettingsTabContent;

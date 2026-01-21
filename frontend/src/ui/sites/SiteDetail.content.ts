import { type Dictionary, t } from "intlayer";

const siteDetailContent = {
	key: "site-detail",
	content: {
		backButton: t({
			en: "Back to Sites",
			es: "Volver a Sitios",
		}),
		// Header actions
		rebuildButton: t({
			en: "Rebuild Site",
			es: "Reconstruir Sitio",
		}),
		rebuildingButton: t({
			en: "Rebuilding...",
			es: "Reconstruyendo...",
		}),
		deleteButton: t({
			en: "Delete Site",
			es: "Eliminar Sitio",
		}),
		cancelBuildButton: t({
			en: "Cancel Build",
			es: "Cancelar Construcción",
		}),
		// Status indicators
		updateAvailable: t({
			en: "Update Available",
			es: "Actualización Disponible",
		}),
		updateAvailableDescription: t({
			en: "Articles have been modified since the last build",
			es: "Los artículos han sido modificados desde la última construcción",
		}),
		// Change reason descriptions
		changeReasonContent: t({
			en: "Content Changed",
			es: "Contenido Modificado",
		}),
		changeReasonSelection: t({
			en: "Selection Changed",
			es: "Selección Modificada",
		}),
		selectionChangesDescription: t({
			en: "Article selection has changed since the last build",
			es: "La selección de artículos ha cambiado desde la última construcción",
		}),
		contentChangesDescription: t({
			en: "Article content has been modified since the last build",
			es: "El contenido de artículos ha sido modificado desde la última construcción",
		}),
		mixedChangesDescription: t({
			en: "Articles have been modified and selection has changed since the last build",
			es: "Los artículos han sido modificados y la selección ha cambiado desde la última construcción",
		}),
		configChangesDescription: t({
			en: "Configuration files have been manually edited since the last build",
			es: "Los archivos de configuración han sido editados manualmente desde la última construcción",
		}),
		configAndContentChangesDescription: t({
			en: "Articles and configuration files have been modified since the last build",
			es: "Los artículos y archivos de configuración han sido modificados desde la última construcción",
		}),
		// Auth change descriptions
		authChangesDescription: t({
			en: "Authentication settings have been changed since the last build",
			es: "La configuración de autenticación ha cambiado desde la última construcción",
		}),
		authAndOtherChangesDescription: t({
			en: "Authentication settings and other content have been modified since the last build",
			es: "La configuración de autenticación y otro contenido han sido modificados desde la última construcción",
		}),
		authSettingsTitle: t({
			en: "Authentication Settings",
			es: "Configuración de Autenticación",
		}),
		authSettingLabel: t({
			en: "Site Authentication",
			es: "Autenticación del Sitio",
		}),
		authEnabled: t({
			en: "Enabled",
			es: "Habilitado",
		}),
		authDisabled: t({
			en: "Disabled",
			es: "Deshabilitado",
		}),
		changedConfigFilesTitle: t({
			en: "Changed Config Files",
			es: "Archivos de Configuración Modificados",
		}),
		changedFilesTitle: t({
			en: "Changed Files",
			es: "Archivos Modificados",
		}),
		changeTypeNew: t({
			en: "New",
			es: "Nuevo",
		}),
		changeTypeUpdated: t({
			en: "Updated",
			es: "Actualizado",
		}),
		changeTypeDeleted: t({
			en: "Deleted",
			es: "Eliminado",
		}),
		upToDate: t({
			en: "Up to Date",
			es: "Actualizado",
		}),
		checkingConfigFiles: t({
			en: "Checking for config file changes...",
			es: "Comprobando cambios en archivos de configuración...",
		}),
		// Deployment info section
		deploymentInfoTitle: t({
			en: "Deployment Information",
			es: "Información de Despliegue",
		}),
		deploymentStatusTitle: t({
			en: "Deployment Status",
			es: "Estado de Despliegue",
		}),
		repositoryInfoTitle: t({
			en: "Repository & Content",
			es: "Repositorio y Contenido",
		}),
		githubRepository: t({
			en: "GitHub Repository",
			es: "Repositorio GitHub",
		}),
		vercelDeployment: t({
			en: "Vercel Deployment",
			es: "Despliegue Vercel",
		}),
		previewUrl: t({
			en: "Preview URL",
			es: "URL de Vista Previa",
		}),
		productionUrl: t({
			en: "Production URL",
			es: "URL de Producción",
		}),
		framework: t({
			en: "Framework",
			es: "Framework",
		}),
		lastDeployed: t({
			en: "Last Deployed",
			es: "Último Despliegue",
		}),
		lastPublished: t({
			en: "Last Published",
			es: "Última Publicación",
		}),
		lastBuilt: t({
			en: "Last Built",
			es: "Última Construcción",
		}),
		// Status section
		statusTitle: t({
			en: "Status",
			es: "Estado",
		}),
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
		buildError: t({
			en: "Build Error",
			es: "Error de Construcción",
		}),
		buildInProgress: t({
			en: "Build in Progress",
			es: "Construcción en Progreso",
		}),
		// Articles section
		articlesTitle: t({
			en: "Articles Included",
			es: "Artículos Incluidos",
		}),
		articlesCount: t({
			en: "articles",
			es: "artículos",
		}),
		mdxCompilationTitle: t({
			en: "MDX Compilation",
			es: "Compilación MDX",
		}),
		mdxCompliant: t({
			en: "MDX Compliant",
			es: "Compatible con MDX",
		}),
		mdxNonCompliant: t({
			en: "Needs Fix",
			es: "Necesita Corrección",
		}),
		fixMdxButton: t({
			en: "Fix MDX",
			es: "Corregir MDX",
		}),
		loadingArticles: t({
			en: "Loading articles...",
			es: "Cargando artículos...",
		}),
		// Visibility
		visibilityTitle: t({
			en: "Visibility",
			es: "Visibilidad",
		}),
		visibilityInternal: t({
			en: "Internal",
			es: "Interno",
		}),
		visibilityExternal: t({
			en: "External",
			es: "Externo",
		}),
		// Protection section
		protectionTitle: t({
			en: "Site Protection",
			es: "Protección del Sitio",
		}),
		protectionStatus: t({
			en: "Protection Status",
			es: "Estado de Protección",
		}),
		protectionProtected: t({
			en: "Protected",
			es: "Protegido",
		}),
		protectionPublic: t({
			en: "Public",
			es: "Público",
		}),
		protectionType: t({
			en: "Protection Type",
			es: "Tipo de Protección",
		}),
		protectionLastChecked: t({
			en: "Last Checked",
			es: "Última Verificación",
		}),
		protectionRefresh: t({
			en: "Refresh Status",
			es: "Actualizar Estado",
		}),
		protectionMakePublic: t({
			en: "Make Public",
			es: "Hacer Público",
		}),
		protectionMakeProtected: t({
			en: "Make Protected",
			es: "Proteger",
		}),
		protectionDescription: t({
			en: "Protected sites require authentication to access. Public sites can be accessed by anyone on the internet.",
			es: "Los sitios protegidos requieren autenticación para acceder. Los sitios públicos pueden ser accedidos por cualquier persona en internet.",
		}),
		allowedDomainTitle: t({
			en: "Allowed Domain",
			es: "Dominio Permitido",
		}),
		publishButton: t({
			en: "Publish Site",
			es: "Publicar Sitio",
		}),
		unpublishButton: t({
			en: "Unpublish Site",
			es: "Despublicar Sitio",
		}),
		publishingButton: t({
			en: "Publishing...",
			es: "Publicando...",
		}),
		unpublishingButton: t({
			en: "Unpublishing...",
			es: "Despublicando...",
		}),
		publishStatusTitle: t({
			en: "Publication Status",
			es: "Estado de Publicación",
		}),
		publishedStatus: t({
			en: "Published",
			es: "Publicado",
		}),
		unpublishedStatus: t({
			en: "Unpublished",
			es: "No Publicado",
		}),
		internalSiteDescription: t({
			en: "Internal sites require users to log in with an email from the allowed domain. Authentication is handled at the application level.",
			es: "Los sitios internos requieren que los usuarios inicien sesión con un correo del dominio permitido. La autenticación se maneja a nivel de aplicación.",
		}),
		externalSiteDescription: t({
			en: "External sites can be published to make them publicly accessible, or unpublished to restrict access.",
			es: "Los sitios externos pueden publicarse para hacerlos públicamente accesibles, o despublicarse para restringir el acceso.",
		}),
		// Delete confirmation
		deleteConfirmTitle: t({
			en: "Delete Site?",
			es: "¿Eliminar Sitio?",
		}),
		deleteConfirmDescription: t({
			en: "This will permanently delete the site and all associated resources. This action cannot be undone.",
			es: "Esto eliminará permanentemente el sitio y todos los recursos asociados. Esta acción no se puede deshacer.",
		}),
		deleteConfirmButton: t({
			en: "Delete",
			es: "Eliminar",
		}),
		cancelButton: t({
			en: "Cancel",
			es: "Cancelar",
		}),
		// Links
		viewSite: t({
			en: "View Site",
			es: "Ver Sitio",
		}),
		viewRepository: t({
			en: "View Repository",
			es: "Ver Repositorio",
		}),
		// Loading
		loading: t({
			en: "Loading...",
			es: "Cargando...",
		}),
		notFound: t({
			en: "Site not found",
			es: "Sitio no encontrado",
		}),
		// Articles tab
		articlesTabTitle: t({
			en: "Articles",
			es: "Artículos",
		}),
		allArticlesIncluded: t({
			en: "All articles are included in this site",
			es: "Todos los artículos están incluidos en este sitio",
		}),
		selectedArticlesMode: t({
			en: "specific articles selected",
			es: "artículos específicos seleccionados",
		}),
		selectSpecificArticles: t({
			en: "Switch to specific article selection",
			es: "Cambiar a selección de artículos específicos",
		}),
		includeAllArticles: t({
			en: "Include all articles",
			es: "Incluir todos los artículos",
		}),
		saveArticleChanges: t({
			en: "Save Changes",
			es: "Guardar Cambios",
		}),
		savingArticleChanges: t({
			en: "Saving...",
			es: "Guardando...",
		}),
		noChangesToSave: t({
			en: "No changes to save",
			es: "Sin cambios para guardar",
		}),
		articleChangesSaved: t({
			en: "Article selection saved successfully",
			es: "Selección de artículos guardada exitosamente",
		}),
		articleChangesFailed: t({
			en: "Failed to save article selection",
			es: "Error al guardar la selección de artículos",
		}),
		loadingArticlesForTab: t({
			en: "Loading articles...",
			es: "Cargando artículos...",
		}),
		// Tab labels
		tabOverview: t({
			en: "Overview",
			es: "Resumen",
		}),
		tabContent: t({
			en: "Content",
			es: "Contenido",
		}),
		tabSettings: t({
			en: "Settings",
			es: "Configuración",
		}),
		tabLogs: t({
			en: "Logs",
			es: "Registros",
		}),
		// Legacy tab labels (kept for backwards compatibility)
		tabStatus: t({
			en: "Status",
			es: "Estado",
		}),
		tabRepository: t({
			en: "Repository",
			es: "Repositorio",
		}),
		tabArticles: t({
			en: "Articles",
			es: "Artículos",
		}),
		// Consistency warning dialog
		consistencyWarningTitle: t({
			en: "Navigation Consistency Issues",
			es: "Problemas de Consistencia de Navegación",
		}),
		consistencyWarningDescription: t({
			en: "The _meta.ts file has inconsistencies with the content folder. These will be auto-corrected during rebuild.",
			es: "El archivo _meta.ts tiene inconsistencias con la carpeta de contenido. Estas se corregirán automáticamente durante la reconstrucción.",
		}),
		orphanedEntriesLabel: t({
			en: "Entries in _meta.ts without matching articles:",
			es: "Entradas en _meta.ts sin artículos correspondientes:",
		}),
		missingEntriesLabel: t({
			en: "Articles not listed in _meta.ts:",
			es: "Artículos no listados en _meta.ts:",
		}),
		proceedAnywayButton: t({
			en: "Proceed Anyway",
			es: "Proceder de Todos Modos",
		}),
	},
} satisfies Dictionary;

export default siteDetailContent;

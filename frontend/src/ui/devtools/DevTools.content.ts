import { type Dictionary, t } from "intlayer";

const devToolsContent = {
	key: "devtools",
	content: {
		// Main DevTools page
		title: t({
			en: "Developer Tools",
			es: "Herramientas de Desarrollador",
		}),
		subtitle: t({
			en: "Tools for local development and testing",
			es: "Herramientas para desarrollo y pruebas locales",
		}),

		// Demo Jobs Tester
		demoJobs: {
			title: t({
				en: "Demo Jobs",
				es: "Trabajos de Demostración",
			}),
			subtitle: t({
				en: "Test dashboard widgets with demo jobs that update stats in real-time",
				es: "Prueba widgets del panel con trabajos de demostración que actualizan estadísticas en tiempo real",
			}),
			quickStats: t({
				en: "Quick Stats",
				es: "Estadísticas Rápidas",
			}),
			quickStatsDesc: t({
				en: "Simple counter demo (5-10 seconds)",
				es: "Demostración simple de contador (5-10 segundos)",
			}),
			multiStatProgress: t({
				en: "Multi-Stat Progress",
				es: "Progreso Multi-Estadística",
			}),
			multiStatProgressDesc: t({
				en: "Multiple stats updating (15-20 seconds)",
				es: "Múltiples estadísticas actualizándose (15-20 segundos)",
			}),
			articlesLink: t({
				en: "Articles Link",
				es: "Enlace a Artículos",
			}),
			articlesLinkDesc: t({
				en: "Demo with link to Articles page (10-15 seconds)",
				es: "Demostración con enlace a página de Artículos (10-15 segundos)",
			}),
			slowProcessing: t({
				en: "Slow Processing",
				es: "Procesamiento Lento",
			}),
			slowProcessingDesc: t({
				en: "Long-running job with phases (30-40 seconds)",
				es: "Trabajo de larga duración con fases (30-40 segundos)",
			}),
			runEnd2End: t({
				en: "Run End2End Flow",
				es: "Ejecutar Flujo End2End",
			}),
			runEnd2EndDesc: t({
				en: "Sample job that prints hello world",
				es: "Trabajo de muestra que imprime hello world",
			}),
			running: t({
				en: "Running...",
				es: "Ejecutando...",
			}),
			runDemo: t({
				en: "Run Demo",
				es: "Ejecutar Demo",
			}),
			integration: t({
				en: "Integration",
				es: "Integración",
			}),
			noActiveIntegrations: t({
				en: "No active integrations found",
				es: "No se encontraron integraciones activas",
			}),
			tipLabel: t({
				en: "Tip:",
				es: "Consejo:",
			}),
			tipMessage: t({
				en: "Navigate to the Dashboard page to see the demo jobs running with live stat updates.",
				es: "Navega a la página del Panel para ver los trabajos de demostración ejecutándose con actualizaciones de estadísticas en vivo.",
			}),
			failedToTrigger: t({
				en: "Failed to trigger demo job",
				es: "Error al activar el trabajo de demostración",
			}),
		},

		// Data Clearer
		dataClearer: {
			title: t({
				en: "Data Clearer",
				es: "Limpiador de Datos",
			}),
			subtitle: t({
				en: "Clear various types of data for development and testing purposes",
				es: "Limpiar varios tipos de datos para desarrollo y pruebas",
			}),
			clearArticles: t({
				en: "Clear Articles",
				es: "Limpiar Artículos",
			}),
			clearArticlesDesc: t({
				en: "Remove all articles and their chunks",
				es: "Eliminar todos los artículos y sus fragmentos",
			}),
			clearArticlesConfirm: t({
				en: "Are you sure you want to clear all articles? This will delete all articles and their associated chunks. This action cannot be undone.",
				es: "¿Estás seguro de que quieres limpiar todos los artículos? Esto eliminará todos los artículos y sus fragmentos asociados. Esta acción no se puede deshacer.",
			}),
			clearSites: t({
				en: "Clear Sites",
				es: "Limpiar Sitios",
			}),
			clearSitesDesc: t({
				en: "Remove all sites",
				es: "Eliminar todos los sitios",
			}),
			clearSitesConfirm: t({
				en: "Are you sure you want to clear all sites? This will delete all sites. This action cannot be undone.",
				es: "¿Estás seguro de que quieres limpiar todos los sitios? Esto eliminará todos los sitios. Esta acción no se puede deshacer.",
			}),
			clearJobs: t({
				en: "Clear Jobs",
				es: "Limpiar Trabajos",
			}),
			clearJobsDesc: t({
				en: "Remove all job execution history",
				es: "Eliminar todo el historial de ejecución de trabajos",
			}),
			clearJobsConfirm: t({
				en: "Are you sure you want to clear all job executions? This will delete all job execution history. This action cannot be undone.",
				es: "¿Estás seguro de que quieres limpiar todas las ejecuciones de trabajos? Esto eliminará todo el historial de ejecución. Esta acción no se puede deshacer.",
			}),
			clearGitHub: t({
				en: "Clear GitHub Integrations",
				es: "Limpiar Integraciones de GitHub",
			}),
			clearGitHubDesc: t({
				en: "Remove all GitHub integrations and installations",
				es: "Eliminar todas las integraciones e instalaciones de GitHub",
			}),
			clearGitHubConfirm: t({
				en: "Are you sure you want to clear all GitHub integrations and installations? This will delete all GitHub integrations and installations. This action cannot be undone.",
				es: "¿Estás seguro de que quieres limpiar todas las integraciones e instalaciones de GitHub? Esto eliminará todas las integraciones e instalaciones de GitHub. Esta acción no se puede deshacer.",
			}),
			clearSync: t({
				en: "Clear Sync Data",
				es: "Limpiar Datos de Sincronización",
			}),
			clearSyncDesc: t({
				en: "Remove all sync cursor data for CLI sync",
				es: "Eliminar todos los datos de cursor de sincronización para CLI sync",
			}),
			clearSyncConfirm: t({
				en: "Are you sure you want to clear all sync data? This will reset the sync cursor and remove all sync article tracking. CLI clients will need to re-sync. This action cannot be undone.",
				es: "¿Estás seguro de que quieres limpiar todos los datos de sincronización? Esto restablecerá el cursor de sincronización y eliminará todo el seguimiento de artículos sincronizados. Los clientes CLI necesitarán re-sincronizar. Esta acción no se puede deshacer.",
			}),
			clearSpaces: t({
				en: "Clear Spaces",
				es: "Limpiar Espacios",
			}),
			clearSpacesDesc: t({
				en: "Remove all spaces, including all folders and articles within them",
				es: "Eliminar todos los espacios, incluyendo todas las carpetas y artículos dentro de ellos",
			}),
			clearSpacesConfirm: t({
				en: "Are you sure you want to clear all spaces? This will delete all spaces along with all folders and articles they contain. This action cannot be undone.",
				es: "¿Estás seguro de que quieres limpiar todos los espacios? Esto eliminará todos los espacios junto con todas las carpetas y artículos que contienen. Esta acción no se puede deshacer.",
			}),
			confirmTitle: t({
				en: "Are you sure?",
				es: "¿Estás seguro?",
			}),
			cancel: t({
				en: "Cancel",
				es: "Cancelar",
			}),
			clearing: t({
				en: "Clearing...",
				es: "Limpiando...",
			}),
			clear: t({
				en: "Clear",
				es: "Limpiar",
			}),
			warningLabel: t({
				en: "Warning:",
				es: "Advertencia:",
			}),
			warningMessage: t({
				en: "These operations cannot be undone. Only use in development environments.",
				es: "Estas operaciones no se pueden deshacer. Solo usar en entornos de desarrollo.",
			}),
			failedToClear: t({
				en: "Failed to clear data",
				es: "Error al limpiar datos",
			}),
		},

		// Draft Generator
		draftGenerator: {
			title: t({
				en: "Draft Generator",
				es: "Generador de Borradores",
			}),
			subtitle: t({
				en: "Generate draft with mock section edit suggestions for testing section changes on existing articles",
				es: "Generar borrador con sugerencias de edición de secciones simuladas para probar cambios de sección en artículos existentes",
			}),
			docJrnLabel: t({
				en: "Article JRN",
				es: "JRN del Artículo",
			}),
			docJrnPlaceholder: t({
				en: "jrn:jolli:doc:article-name",
				es: "jrn:jolli:doc:nombre-articulo",
			}),
			docJrnRequired: t({
				en: "Article JRN is required",
				es: "El JRN del artículo es obligatorio",
			}),
			numEditsLabel: t({
				en: "Number of Section Edits",
				es: "Número de Ediciones de Sección",
			}),
			numEditsDesc: t({
				en: "Generate 1-5 mock section edit suggestions",
				es: "Generar 1-5 sugerencias de edición de sección simuladas",
			}),
			generate: t({
				en: "Generate Draft",
				es: "Generar Borrador",
			}),
			generating: t({
				en: "Generating...",
				es: "Generando...",
			}),
			viewDraft: t({
				en: "View Draft",
				es: "Ver Borrador",
			}),
			failedToGenerate: t({
				en: "Failed to generate draft",
				es: "Error al generar borrador",
			}),
			tipLabel: t({
				en: "Tip:",
				es: "Consejo:",
			}),
			tipMessage: t({
				en: "Generated drafts will have highlighted sections that you can click to view and apply mock edit suggestions.",
				es: "Los borradores generados tendrán secciones resaltadas en las que puedes hacer clic para ver y aplicar sugerencias de edición simuladas.",
			}),
		},

		// Config Reloader
		configReloader: {
			title: t({
				en: "Config Reloader",
				es: "Recargador de Configuración",
			}),
			subtitle: t({
				en: "Reload configuration from AWS Parameter Store and clear tenant caches",
				es: "Recargar configuración desde AWS Parameter Store y limpiar cachés de inquilinos",
			}),
			reloadButton: t({
				en: "Reload Configuration",
				es: "Recargar Configuración",
			}),
			reloading: t({
				en: "Reloading...",
				es: "Recargando...",
			}),
			success: t({
				en: "Configuration reloaded successfully",
				es: "Configuración recargada exitosamente",
			}),
			failedToReload: t({
				en: "Failed to reload configuration",
				es: "Error al recargar configuración",
			}),
			tipLabel: t({
				en: "Note:",
				es: "Nota:",
			}),
			tipMessage: t({
				en: "This reloads config values from AWS Parameter Store and clears tenant-specific config caches. New config values will take effect immediately.",
				es: "Esto recarga los valores de configuración desde AWS Parameter Store y limpia los cachés de configuración específicos del inquilino. Los nuevos valores de configuración tomarán efecto inmediatamente.",
			}),
		},

		// GitHub App Creator
		githubApp: {
			title: t({
				en: "Create a GitHub App",
				es: "Crear una Aplicación de GitHub",
			}),
			loading: t({
				en: "Loading...",
				es: "Cargando...",
			}),
			subtitle: t({
				en: "Generate a new GitHub App for local development and get the configuration JSON.",
				es: "Generar una nueva aplicación de GitHub para desarrollo local y obtener el JSON de configuración.",
			}),
			orgLabel: t({
				en: "GitHub Organization",
				es: "Organización de GitHub",
			}),
			manifestLabel: t({
				en: "App Manifest (edit if needed)",
				es: "Manifiesto de la App (editar si es necesario)",
			}),
			createButton: t({
				en: "Create GitHub App",
				es: "Crear Aplicación de GitHub",
			}),
			successTitle: t({
				en: "GitHub App Created Successfully!",
				es: "¡Aplicación de GitHub Creada Exitosamente!",
			}),
			successMessage: t({
				en: "Your GitHub App",
				es: "Tu aplicación de GitHub",
			}),
			hasBeenCreated: t({
				en: "has been created.",
				es: "ha sido creada.",
			}),
			viewOnGitHub: t({
				en: "View on GitHub",
				es: "Ver en GitHub",
			}),
			configLabel: t({
				en: "Configuration JSON",
				es: "JSON de Configuración",
			}),
			configInstructions: t({
				en: "Copy this JSON and save it to your",
				es: "Copia este JSON y guárdalo en tu",
			}),
			fileAsValue: t({
				en: "file as the value for",
				es: "archivo como el valor para",
			}),
			orSaveToAws: t({
				en: ", or save it to AWS Parameter Store.",
				es: ", o guárdalo en AWS Parameter Store.",
			}),
			copied: t({
				en: "Copied!",
				es: "¡Copiado!",
			}),
			createAnother: t({
				en: "Create Another App",
				es: "Crear Otra Aplicación",
			}),
			failedToComplete: t({
				en: "Failed to complete GitHub App setup",
				es: "Error al completar la configuración de la aplicación de GitHub",
			}),
			failedToCopy: t({
				en: "Failed to copy to clipboard",
				es: "Error al copiar al portapapeles",
			}),
		},
	},
} satisfies Dictionary;

export default devToolsContent;

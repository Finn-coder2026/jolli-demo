import { type Dictionary, t } from "intlayer";

const siteContentTabContent = {
	key: "site-content-tab",
	content: {
		title: t({
			en: "Content",
			es: "Contenido",
		}),
		// Sub-tabs
		tabArticles: t({
			en: "Articles",
			es: "Artículos",
		}),
		tabNavigation: t({
			en: "Navigation",
			es: "Navegación",
		}),
		// Articles section
		articlesDescription: t({
			en: "Select which articles to include in your documentation site",
			es: "Selecciona qué artículos incluir en tu sitio de documentación",
		}),
		includeAllArticles: t({
			en: "Include All Articles",
			es: "Incluir Todos los Artículos",
		}),
		includeAllDescription: t({
			en: "Automatically include all published articles",
			es: "Incluir automáticamente todos los artículos publicados",
		}),
		selectedCount: t({
			en: "selected",
			es: "seleccionados",
		}),
		saveSelection: t({
			en: "Save Selection",
			es: "Guardar Selección",
		}),
		saving: t({
			en: "Saving...",
			es: "Guardando...",
		}),
		noChanges: t({
			en: "No changes",
			es: "Sin cambios",
		}),
		selectionSaved: t({
			en: "Selection saved successfully",
			es: "Selección guardada exitosamente",
		}),
		selectionFailed: t({
			en: "Failed to save selection",
			es: "Error al guardar la selección",
		}),
		loadingArticles: t({
			en: "Loading articles...",
			es: "Cargando artículos...",
		}),
		// Navigation section
		navigationDescription: t({
			en: "Edit the sidebar navigation structure for your documentation",
			es: "Edita la estructura de navegación del sidebar de tu documentación",
		}),
		editNavigation: t({
			en: "Edit Navigation",
			es: "Editar Navegación",
		}),
		navigationFile: t({
			en: "Navigation File",
			es: "Archivo de Navegación",
		}),
		noNavigationFile: t({
			en: "No navigation file found. Create one to customize your sidebar.",
			es: "No se encontró archivo de navegación. Crea uno para personalizar tu sidebar.",
		}),
		createNavigationFile: t({
			en: "Create Navigation File",
			es: "Crear Archivo de Navegación",
		}),
		// Status messages
		unsavedChanges: t({
			en: "Unsaved changes",
			es: "Cambios sin guardar",
		}),
		rebuildNote: t({
			en: "Changes will be applied when you rebuild the site",
			es: "Los cambios se aplicarán cuando reconstruyas el sitio",
		}),
	},
} satisfies Dictionary;

export default siteContentTabContent;

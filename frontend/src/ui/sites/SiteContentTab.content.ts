import { type Dictionary, t } from "intlayer";

const siteContentTabContent = {
	key: "site-content-tab",
	content: {
		// Articles section
		articlesTitle: t({
			en: "Articles",
			es: "Artículos",
		}),
		articlesDescription: t({
			en: "Select which articles to include in your documentation site",
			es: "Selecciona qué artículos incluir en tu sitio de documentación",
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
		// Status messages
		unsavedChanges: t({
			en: "Unsaved changes",
			es: "Cambios sin guardar",
		}),
		rebuildNote: t({
			en: "After saving, click Publish in the header to apply changes",
			es: "Después de guardar, haz clic en Publicar en el encabezado para aplicar los cambios",
		}),
	},
} satisfies Dictionary;

export default siteContentTabContent;

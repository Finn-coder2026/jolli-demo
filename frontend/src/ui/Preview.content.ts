import { type Dictionary, insert, t } from "intlayer";

/**
 * Localization content for Preview component
 */
const previewContent = {
	key: "preview",
	content: {
		// Loading and error states
		loadingPreview: t({
			en: insert("Loading preview for {{jrn}}..."),
			es: insert("Cargando vista previa para {{jrn}}..."),
		}),
		articleNotFound: t({
			en: "Article Not Found",
			es: "Artículo no encontrado",
		}),
		couldNotLoadArticle: t({
			en: insert("Could not load article with JRN: {{jrn}}"),
			es: insert("No se pudo cargar el artículo con JRN: {{jrn}}"),
		}),

		// Metadata
		untitled: t({
			en: "Untitled",
			es: "Sin título",
		}),
		source: t({
			en: "Source:",
			es: "Fuente:",
		}),
		unknown: t({
			en: "Unknown",
			es: "Desconocido",
		}),
		lastUpdated: t({
			en: insert("Last updated: {{date}}"),
			es: insert("Última actualización: {{date}}"),
		}),
		version: t({
			en: insert("Version {{version}}"),
			es: insert("Versión {{version}}"),
		}),

		// View toggle
		rendered: t({
			en: "Rendered",
			es: "Renderizado",
		}),
		sourceView: t({
			en: "Source",
			es: "Código fuente",
		}),

		// Edit button
		edit: t({
			en: "Edit",
			es: "Editar",
		}),
		suggestion: t({
			en: "suggestion",
			es: "sugerencia",
		}),
		suggestions: t({
			en: "suggestions",
			es: "sugerencias",
		}),
	},
} satisfies Dictionary;

export default previewContent;

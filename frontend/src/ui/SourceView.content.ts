import { type Dictionary, insert, t } from "intlayer";

/**
 * Localization content for SourceView component
 */
const sourceViewContent = {
	key: "source-view",
	content: {
		// Loading and error states
		loadingSource: t({
			en: insert("Loading original source for {{jrn}}..."),
			es: insert("Cargando fuente original para {{jrn}}..."),
		}),
		sourceNotAvailable: t({
			en: "Original Source Not Available",
			es: "Fuente original no disponible",
		}),
		couldNotLoadArticle: t({
			en: insert("Could not load article with JRN: {{jrn}}"),
			es: insert("No se pudo cargar el artículo con JRN: {{jrn}}"),
		}),
		noSourceContent: t({
			en: "This article does not have original source content available.",
			es: "Este artículo no tiene contenido de fuente original disponible.",
		}),

		// Section headings
		originalSource: t({
			en: "Original Source",
			es: "Fuente original",
		}),
		sourceMetadata: t({
			en: "Source Metadata",
			es: "Metadatos de fuente",
		}),
		sourceContent: t({
			en: "Source Content",
			es: "Contenido de fuente",
		}),

		// Metadata labels
		created: t({
			en: insert("Created: {{date}}"),
			es: insert("Creado: {{date}}"),
		}),
		updated: t({
			en: insert("Updated: {{date}}"),
			es: insert("Actualizado: {{date}}"),
		}),
	},
} satisfies Dictionary;

export default sourceViewContent;

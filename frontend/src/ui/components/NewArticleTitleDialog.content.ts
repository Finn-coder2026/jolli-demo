import { type Dictionary, t } from "intlayer";

const newArticleTitleDialogContent = {
	key: "new-article-title-dialog",
	content: {
		title: t({
			en: "New Article",
			es: "Nuevo artículo",
		}),
		subtitle: t({
			en: "Enter a title for your new article",
			es: "Ingrese un título para su nuevo artículo",
		}),
		titlePlaceholder: t({
			en: "Article title...",
			es: "Título del artículo...",
		}),
		typeLabel: t({
			en: "Document Type",
			es: "Tipo de documento",
		}),
		typeMarkdown: t({
			en: "Markdown",
			es: "Markdown",
		}),
		typeJson: t({
			en: "OpenAPI Specification (JSON)",
			es: "Especificación OpenAPI (JSON)",
		}),
		typeYaml: t({
			en: "OpenAPI Specification (YAML)",
			es: "Especificación OpenAPI (YAML)",
		}),
		typeDescription: t({
			en: "Choose Markdown for documentation articles, or OpenAPI format for API specifications.",
			es: "Elija Markdown para artículos de documentación, o formato OpenAPI para especificaciones de API.",
		}),
		cancel: t({
			en: "Cancel",
			es: "Cancelar",
		}),
		create: t({
			en: "Create",
			es: "Crear",
		}),
	},
} satisfies Dictionary;

export default newArticleTitleDialogContent;

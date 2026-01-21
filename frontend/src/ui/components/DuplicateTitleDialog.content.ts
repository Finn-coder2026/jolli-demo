import { type Dictionary, insert, t } from "intlayer";

const duplicateTitleDialogContent = {
	key: "duplicate-title-dialog",
	content: {
		title: t({
			en: "Similar Titles Found",
			es: "Títulos similares encontrados",
		}),
		subtitle: t({
			en: insert(
				'Found {{count}} existing article(s) or draft(s) with a similar title to "{{title}}". Would you like to edit one of these instead?',
			),
			es: insert(
				'Se encontraron {{count}} artículo(s) o borrador(es) existente(s) con un título similar a "{{title}}". ¿Le gustaría editar uno de estos en su lugar?',
			),
		}),
		existingArticles: t({
			en: "Existing Articles",
			es: "Artículos existentes",
		}),
		existingDrafts: t({
			en: "Existing Drafts",
			es: "Borradores existentes",
		}),
		lastUpdated: t({
			en: "Last updated",
			es: "Última actualización",
		}),
		cancel: t({
			en: "Cancel",
			es: "Cancelar",
		}),
		createAnyway: t({
			en: "Create New Anyway",
			es: "Crear nuevo de todas formas",
		}),
	},
} satisfies Dictionary;

export default duplicateTitleDialogContent;

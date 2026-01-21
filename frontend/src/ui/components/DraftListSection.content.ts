import { type Dictionary, t } from "intlayer";

const draftListSectionContent = {
	key: "draft-list-section",
	content: {
		confirmDelete: t({
			en: "Are you sure you want to delete this draft?",
			es: "¿Estás seguro de que quieres eliminar este borrador?",
		}),
		draftsTitle: t({
			en: "Article Drafts",
			es: "Borradores de artículos",
		}),
		draftsSubtitle: t({
			en: "Collaborative AI-powered article drafts",
			es: "Borradores de artículos colaborativos con IA",
		}),
		viewAllDrafts: t({
			en: "View all drafts",
			es: "Ver todos los borradores",
		}),
		editing: t({
			en: "Editing:",
			es: "Editando:",
		}),
		suggestedEdits: t({
			en: "Suggested Edits",
			es: "Ediciones sugeridas",
		}),
		// Content type labels
		typeMarkdown: t({ en: "Markdown", es: "Markdown" }),
		typeJson: t({ en: "JSON", es: "JSON" }),
		typeYaml: t({ en: "YAML", es: "YAML" }),
		// Sharing badges
		shared: t({ en: "Shared", es: "Compartido" }),
		aiDraft: t({ en: "AI Draft", es: "Borrador IA" }),
	},
} satisfies Dictionary;

export default draftListSectionContent;

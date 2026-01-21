import { type Dictionary, insert, t } from "intlayer";

/**
 * Localization content for draft articles component
 */
const draftArticlesContent = {
	key: "draft-articles",
	content: {
		allDraftsTitle: t({
			en: "All Drafts",
			es: "Todos los borradores",
		}),
		allDraftsSubtitle: t({
			en: "Manage your collaborative article drafts",
			es: "Administra tus borradores de artículos colaborativos",
		}),
		confirmDeleteDraft: t({
			en: insert("Are you sure you want to delete '{{title}}'?"),
			es: insert("¿Estás seguro de que quieres eliminar '{{title}}'?"),
		}),
		searchDraftsPlaceholder: t({
			en: "Search drafts...",
			es: "Buscar borradores...",
		}),
		noDraftsFound: t({
			en: "No drafts found",
			es: "No se encontraron borradores",
		}),
		tryDifferentSearch: t({
			en: "Try a different search",
			es: "Intenta una búsqueda diferente",
		}),
		noDraftsDesc: t({
			en: "Create your first collaborative article draft",
			es: "Crea tu primer borrador de artículo colaborativo",
		}),
	},
} satisfies Dictionary;

export default draftArticlesContent;

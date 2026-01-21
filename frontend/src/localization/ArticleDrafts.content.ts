import { type Dictionary, t } from "intlayer";

/**
 * Localization content for article draft components
 */
const articleDraftsContent = {
	key: "article-drafts",
	content: {
		editDraft: t({
			en: "Edit",
			es: "Editar",
		}),
		lastEdited: t({
			en: "Last edited",
			es: "Última edición",
		}),
		loadingDrafts: t({
			en: "Loading drafts...",
			es: "Cargando borradores...",
		}),
		noDrafts: t({
			en: "No drafts yet",
			es: "Aún no hay borradores",
		}),
		noDraftsDesc: t({
			en: "Create your first collaborative article draft",
			es: "Crea tu primer borrador de artículo colaborativo",
		}),
	},
} satisfies Dictionary;

export default articleDraftsContent;

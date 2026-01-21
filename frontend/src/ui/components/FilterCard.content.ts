import { type Dictionary, t } from "intlayer";

const filterCardContent = {
	key: "filter-card",
	content: {
		allArticles: t({
			en: "All Articles",
			es: "Todos los artículos",
		}),
		myNewDrafts: t({
			en: "My New Drafts",
			es: "Mis nuevos borradores",
		}),
		sharedWithMe: t({
			en: "New Drafts Shared with me",
			es: "Nuevos borradores compartidos conmigo",
		}),
		suggestedUpdates: t({
			en: "Articles with Suggested Updates",
			es: "Artículos con actualizaciones sugeridas",
		}),
	},
} satisfies Dictionary;

export default filterCardContent;

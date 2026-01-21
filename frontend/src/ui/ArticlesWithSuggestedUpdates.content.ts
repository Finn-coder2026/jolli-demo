import { type Dictionary, t } from "intlayer";

const articlesWithSuggestedUpdatesContent = {
	key: "articles-suggested-updates",
	content: {
		title: t({
			en: "Articles with Suggested Updates",
			es: "Artículos con actualizaciones sugeridas",
		}),
		subtitle: t({
			en: "Review and apply suggested edits to your articles",
			es: "Revisar y aplicar ediciones sugeridas a tus artículos",
		}),
		back: t({
			en: "Back to Dashboard",
			es: "Volver al panel",
		}),
		loading: t({
			en: "Loading articles...",
			es: "Cargando artículos...",
		}),
		noArticles: t({
			en: "No articles with suggested updates",
			es: "No hay artículos con actualizaciones sugeridas",
		}),
		suggestions: t({
			en: "suggestions",
			es: "sugerencias",
		}),
	},
} satisfies Dictionary;

export default articlesWithSuggestedUpdatesContent;

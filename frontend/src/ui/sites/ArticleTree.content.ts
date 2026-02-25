import { type Dictionary, insert, t } from "intlayer";

const articleTreeContent = {
	key: "article-tree",
	content: {
		noArticlesFound: t({
			en: "No articles found",
			es: "No se encontraron artículos",
		}),
		hasPendingChanges: t({
			en: "Has pending changes",
			es: "Tiene cambios pendientes",
		}),
		itemCount: t({
			en: insert("{{count}} items"),
			es: insert("{{count}} elementos"),
		}),
	},
} satisfies Dictionary;

export default articleTreeContent;

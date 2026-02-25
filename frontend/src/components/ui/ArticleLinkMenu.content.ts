import { type Dictionary, t } from "intlayer";

const articleLinkMenuContent = {
	key: "article-link-menu",
	content: {
		noMatchingArticles: t({
			en: "No matching articles",
			es: "No hay artículos coincidentes",
		}),
		noArticlesFound: t({
			en: "No articles found",
			es: "No se encontraron artículos",
		}),
	},
} satisfies Dictionary;

export default articleLinkMenuContent;

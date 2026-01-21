import { type Dictionary, t } from "intlayer";

const articlePickerContent = {
	key: "article-picker",
	content: {
		// Mode toggle
		includeAllArticles: t({
			en: "Include all articles",
			es: "Incluir todos los artículos",
		}),
		selectSpecificArticles: t({
			en: "Select specific articles",
			es: "Seleccionar artículos específicos",
		}),
		// Count displays
		articlesSelected: t({
			en: "articles selected",
			es: "artículos seleccionados",
		}),
		articlesOf: t({
			en: "of",
			es: "de",
		}),
		// Actions
		selectAll: t({
			en: "Select all",
			es: "Seleccionar todo",
		}),
		deselectAll: t({
			en: "Deselect all",
			es: "Deseleccionar todo",
		}),
		// Search
		searchArticles: t({
			en: "Search articles...",
			es: "Buscar artículos...",
		}),
		// Empty states
		noArticlesFound: t({
			en: "No articles found",
			es: "No se encontraron artículos",
		}),
		noArticlesMatchSearch: t({
			en: "No articles match your search",
			es: "Ningún artículo coincide con tu búsqueda",
		}),
		// Loading
		loadingArticles: t({
			en: "Loading articles...",
			es: "Cargando artículos...",
		}),
		// Info
		allArticlesInfo: t({
			en: "All articles will be included in this site",
			es: "Todos los artículos serán incluidos en este sitio",
		}),
	},
} satisfies Dictionary;

export default articlePickerContent;

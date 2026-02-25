import { type Dictionary, insert, t } from "intlayer";

const spaceSearchContent = {
	key: "space-search",
	content: {
		placeholder: t({
			en: "Search articles...",
			es: "Buscar artículos...",
		}),
		clearSearch: t({
			en: "Clear search",
			es: "Limpiar búsqueda",
		}),
		noResults: t({
			en: "No results found",
			es: "No se encontraron resultados",
		}),
		noResultsDescription: t({
			en: "Try different keywords",
			es: "Intenta con otras palabras clave",
		}),
		result: t({
			en: "RESULT",
			es: "RESULTADO",
		}),
		results: t({
			en: "RESULTS",
			es: "RESULTADOS",
		}),
		showingFirstN: t({
			en: insert("showing first {{count}}"),
			es: insert("mostrando los primeros {{count}}"),
		}),
		resultsLimited: t({
			en: "Results limited. Narrow your search for more specific matches.",
			es: "Resultados limitados. Refina tu búsqueda para obtener coincidencias más específicas.",
		}),
	},
} satisfies Dictionary;

export default spaceSearchContent;

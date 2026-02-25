import { type Dictionary, insert, t } from "intlayer";

const articlePickerContent = {
	key: "article-picker",
	content: {
		// Mode toggle
		includeAllArticles: t({
			en: "Include all articles",
			es: "Incluir todos los artículos",
		}),
		// Count displays
		articlesSelected: t({
			en: "selected",
			es: "seleccionados",
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
		// Space labels
		otherArticles: t({
			en: "Other Articles",
			es: "Otros artículos",
		}),
		// Changed articles indicator tooltip
		changedCount: t({
			en: insert("{{count}} changed"),
			es: insert("{{count}} modificados"),
		}),
	},
} satisfies Dictionary;

export default articlePickerContent;

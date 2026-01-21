import { type Dictionary, t } from "intlayer";

const siteArticlesTabContent = {
	key: "site-articles-tab",
	content: {
		title: t({
			en: "Articles",
			es: "Artículos",
		}),
		loadingArticles: t({
			en: "Loading articles...",
			es: "Cargando artículos...",
		}),
		allArticlesIncluded: t({
			en: "All articles included",
			es: "Todos los artículos incluidos",
		}),
		selectedArticlesMode: t({
			en: "articles selected",
			es: "artículos seleccionados",
		}),
		saveArticleChanges: t({
			en: "Save Changes",
			es: "Guardar Cambios",
		}),
		savingArticleChanges: t({
			en: "Saving...",
			es: "Guardando...",
		}),
		noChangesToSave: t({
			en: "No changes to save",
			es: "Sin cambios para guardar",
		}),
		articleChangesSaved: t({
			en: "Article selection saved successfully",
			es: "Selección de artículos guardada exitosamente",
		}),
		articleChangesFailed: t({
			en: "Failed to save article selection",
			es: "Error al guardar la selección de artículos",
		}),
	},
} satisfies Dictionary;

export default siteArticlesTabContent;

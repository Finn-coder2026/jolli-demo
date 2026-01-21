import { type Dictionary, insert, t } from "intlayer";

const articlesContent = {
	key: "articles",
	content: {
		newDraft: t({
			en: "New Article",
			es: "Nuevo artículo",
		}),
		title: t({ en: "Articles", es: "Artículos" }),
		subtitle: t({
			en: "Manage and review your documentation across all sources",
			es: "Gestione y revise su documentación de todas las fuentes",
		}),
		searchPlaceholder: t({ en: "Search articles...", es: "Buscar artículos..." }),
		// Flattened filters
		filtersAllArticles: t({ en: "All Articles", es: "Todos los Artículos" }),
		filtersUpToDate: t({ en: "Up to Date", es: "Actualizado" }),
		filtersNeedsUpdate: t({ en: "Needs Update", es: "Necesita Actualización" }),
		filtersUnderReview: t({ en: "Under Review", es: "En Revisión" }),
		// Flattened status
		statusUpToDate: t({ en: "Up to Date", es: "Actualizado" }),
		statusNeedsUpdate: t({ en: "Needs Update", es: "Necesita Actualización" }),
		statusNeedsUpdateWithCommits: t({
			en: insert("Needs Update ({{count}} commits)"),
			es: insert("Necesita actualización ({{count}} commits)"),
		}),
		statusUnderReview: t({ en: "Under Review", es: "En Revisión" }),
		loading: t({ en: "Loading articles...", es: "Cargando artículos..." }),
		noResults: t({ en: "No articles match your filters", es: "No hay artículos que coincidan con sus filtros" }),
		noArticles: t({ en: "No articles found", es: "No se encontraron artículos" }),
		untitled: t({ en: "Untitled", es: "Sin título" }),
		unknownSource: t({ en: "Unknown Source", es: "Fuente Desconocida" }),
		lastUpdated: t({ en: "Last updated", es: "Última actualización" }),
		qualityScore: t({ en: "Quality Score:", es: "Puntuación de Calidad:" }),
		editButton: t({ en: "Edit", es: "Editar" }),
		reviewButton: t({ en: "Review", es: "Revisar" }),
		// Content type labels
		typeMarkdown: t({ en: "Markdown", es: "Markdown" }),
		typeJson: t({ en: "JSON", es: "JSON" }),
		typeYaml: t({ en: "YAML", es: "YAML" }),
		// Delete confirmation
		confirmDeleteArticle: t({
			en: insert("Are you sure you want to delete '{{title}}'? This action cannot be undone."),
			es: insert("¿Estás seguro de que quieres eliminar '{{title}}'? Esta acción no se puede deshacer."),
		}),
		// Space filter
		spaceFilterPlaceholder: t({ en: "Space", es: "Espacio" }),
		spaceFilterDefault: t({ en: "Default", es: "Predeterminado" }),
		spaceFilterRoot: t({ en: "/root", es: "/root" }),
		// Source doc badge and permissions
		sourceDocBadge: t({ en: "Source", es: "Fuente" }),
		permissionRead: t({ en: "R", es: "L" }),
		permissionWrite: t({ en: "W", es: "E" }),
		permissionExecute: t({ en: "X", es: "X" }),
		permissionEnabled: t({ en: "Enabled", es: "Habilitado" }),
		permissionDisabled: t({ en: "Disabled", es: "Deshabilitado" }),
		permissionDisabledSourceDoc: t({
			en: "Disabled for source documents",
			es: "Deshabilitado para documentos fuente",
		}),
		// Filter cards
		filterAllArticles: t({ en: "All Articles", es: "Todos los artículos" }),
		filterMyNewDrafts: t({ en: "My New Drafts", es: "Mis nuevos borradores" }),
		filterSharedWithMe: t({ en: "New Drafts Shared with me", es: "Nuevos borradores compartidos conmigo" }),
		filterSuggestedUpdates: t({
			en: "Articles with Suggested Updates",
			es: "Artículos con actualizaciones sugeridas",
		}),
		// Draft badges
		draft: t({ en: "Draft", es: "Borrador" }),
		shared: t({ en: "Shared", es: "Compartido" }),
		aiDraft: t({ en: "AI Draft", es: "Borrador IA" }),
		editing: t({ en: "Editing", es: "Editando" }),
		// Article badges
		hasSuggestedUpdates: t({ en: "Suggested Updates", es: "Actualizaciones sugeridas" }),
		// Delete draft confirmation
		confirmDeleteDraft: t({
			en: insert("Are you sure you want to delete draft '{{title}}'? This action cannot be undone."),
			es: insert(
				"¿Estás seguro de que quieres eliminar el borrador '{{title}}'? Esta acción no se puede deshacer.",
			),
		}),
	},
} satisfies Dictionary;

export default articlesContent;

import { type Dictionary, t } from "intlayer";

const inboxContent = {
	key: "inbox",
	content: {
		title: t({ en: "Inbox", es: "Bandeja de entrada" }),
		subtitle: t({
			en: "Recent activity and items requiring your attention",
			es: "Actividad reciente y elementos que requieren su atención",
		}),
		searchPlaceholder: t({ en: "Search inbox...", es: "Buscar en bandeja de entrada..." }),
		loading: t({ en: "Loading inbox...", es: "Cargando bandeja de entrada..." }),
		noItems: t({ en: "No items in your inbox", es: "No hay elementos en su bandeja de entrada" }),
		empty: t({
			en: "Your inbox is empty. New drafts and shared items will appear here.",
			es: "Su bandeja de entrada está vacía. Los nuevos borradores y elementos compartidos aparecerán aquí.",
		}),
		// Section titles
		sectionNewDrafts: t({ en: "My New Drafts", es: "Mis nuevos borradores" }),
		sectionSharedWithMe: t({ en: "Shared with Me", es: "Compartido conmigo" }),
		sectionSuggestedUpdates: t({ en: "Suggested Updates", es: "Actualizaciones sugeridas" }),
		// Item metadata
		lastUpdated: t({ en: "Updated", es: "Actualizado" }),
		draft: t({ en: "Draft", es: "Borrador" }),
		shared: t({ en: "Shared", es: "Compartido" }),
		aiDraft: t({ en: "AI Draft", es: "Borrador IA" }),
		editing: t({ en: "Editing article", es: "Editando artículo" }),
		// Actions
		editButton: t({ en: "Edit", es: "Editar" }),
		viewButton: t({ en: "View", es: "Ver" }),
		deleteButton: t({ en: "Delete", es: "Eliminar" }),
		// Counts
		itemCount: t({
			en: "{{count}} items",
			es: "{{count}} elementos",
		}),
		// Delete confirmation
		confirmDelete: t({
			en: "Are you sure you want to delete '{{title}}'? This action cannot be undone.",
			es: "¿Estás seguro de que quieres eliminar '{{title}}'? Esta acción no se puede deshacer.",
		}),
	},
} satisfies Dictionary;

export default inboxContent;

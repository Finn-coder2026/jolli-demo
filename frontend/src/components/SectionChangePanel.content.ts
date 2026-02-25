import { type Dictionary, t } from "intlayer";

const sectionChangePanelContent = {
	key: "section-change-panel",
	content: {
		// Header
		agentSuggestion: t({
			en: "Agent Suggestion",
			es: "Sugerencia del Agente",
		}),

		// View tabs
		original: t({
			en: "Original",
			es: "Original",
		}),
		suggestion: t({
			en: "Suggestion",
			es: "Sugerencia",
		}),
		changeView: t({
			en: "Change View",
			es: "Ver Cambios",
		}),

		// Action buttons
		accept: t({
			en: "Accept",
			es: "Aceptar",
		}),
		dismiss: t({
			en: "Dismiss",
			es: "Descartar",
		}),

		// Help tooltip
		helpTooltip: t({
			en: "Original shows the current content. Suggestion shows the proposed changes. Change View shows a diff comparison.",
			es: "Original muestra el contenido actual. Sugerencia muestra los cambios propuestos. Ver Cambios muestra una comparación.",
		}),

		// Change type labels
		updateLabel: t({
			en: "Update",
			es: "Actualizar",
		}),
		deleteLabel: t({
			en: "Delete",
			es: "Eliminar",
		}),
		insertAfterLabel: t({
			en: "Insert After",
			es: "Insertar Después",
		}),
		insertBeforeLabel: t({
			en: "Insert Before",
			es: "Insertar Antes",
		}),
		changeLabel: t({
			en: "Change",
			es: "Cambio",
		}),

		// Edge case messages
		noOriginalContent: t({
			en: "New section (no original content)",
			es: "Nueva sección (sin contenido original)",
		}),
		sectionWillBeDeleted: t({
			en: "This section will be deleted",
			es: "Esta sección será eliminada",
		}),
		noDescriptionAvailable: t({
			en: "No description available",
			es: "No hay descripción disponible",
		}),
		noChanges: t({
			en: "No changes to display",
			es: "No hay cambios para mostrar",
		}),

		// Diff view mode toggle
		lineByLine: t({
			en: "Unified",
			es: "Unificado",
		}),
		sideBySide: t({
			en: "Split",
			es: "Dividido",
		}),
	},
} satisfies Dictionary;

export default sectionChangePanelContent;

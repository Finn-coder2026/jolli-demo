import { type Dictionary, insert, t } from "intlayer";

const articleDraftContent = {
	key: "article-draft",
	content: {
		close: t({
			en: "Close",
			es: "Cerrar",
		}),
		errorLoading: t({
			en: "Error loading draft",
			es: "Error al cargar el borrador",
		}),
		errorSaving: t({
			en: "Error saving draft",
			es: "Error al guardar el borrador",
		}),
		errorDiscarding: t({
			en: "Error discarding draft",
			es: "Error al descartar el borrador",
		}),
		untitledDraft: t({
			en: "Untitled Draft",
			es: "Borrador sin título",
		}),
		clickToEdit: t({
			en: "Click to edit title",
			es: "Haz clic para editar el título",
		}),
		saving: t({
			en: "Saving",
			es: "Guardando",
		}),
		lastEditedBy: t({
			en: "Last edited by",
			es: "Última edición por",
		}),
		lastEditedOn: t({
			en: "on",
			es: "el",
		}),
		lastEdited: t({
			en: "Last edited",
			es: "Última edición",
		}),
		noEditsYet: t({
			en: "No edits yet",
			es: "Sin ediciones aún",
		}),
		connected: t({
			en: "Connected",
			es: "Conectado",
		}),
		reconnecting: t({
			en: "Reconnecting...",
			es: "Reconectando...",
		}),
		disconnected: t({
			en: "Disconnected",
			es: "Desconectado",
		}),
		suggestion: t({
			en: "suggestion",
			es: "sugerencia",
		}),
		suggestions: t({
			en: "suggestions",
			es: "sugerencias",
		}),
		validationErrors: t({
			en: "Validation Errors",
			es: "Errores de validación",
		}),
		share: t({
			en: "Share",
			es: "Compartir",
		}),
		sharing: t({
			en: "Sharing...",
			es: "Compartiendo...",
		}),
		shared: t({
			en: "Shared",
			es: "Compartido",
		}),
		shareError: t({
			en: "Error sharing draft",
			es: "Error al compartir el borrador",
		}),
		versionHistory: t({
			en: "History",
			es: "Historial",
		}),
		imageUploadHint: t({
			en: "Upload images (PNG, JPEG, GIF, WebP - max 10MB)",
			es: "Subir imágenes (PNG, JPEG, GIF, WebP - máx 10MB)",
		}),
		deleteImageTitle: t({
			en: "Delete Image",
			es: "Eliminar imagen",
		}),
		deleteImageDescription: t({
			en: "This will permanently delete the image from storage and remove all references to it from this article. This action cannot be undone.",
			es: "Esto eliminará permanentemente la imagen del almacenamiento y eliminará todas las referencias a ella de este artículo. Esta acción no se puede deshacer.",
		}),
		deleteImageConfirm: t({
			en: "Delete Image",
			es: "Eliminar imagen",
		}),
		deleteImageCancel: t({
			en: "Cancel",
			es: "Cancelar",
		}),
		deleteImageError: t({
			en: "Failed to delete image",
			es: "Error al eliminar la imagen",
		}),
		invalidFileType: t({
			en: "Invalid file type. Please upload a PNG, JPEG, GIF, or WebP image.",
			es: "Tipo de archivo inválido. Por favor sube una imagen PNG, JPEG, GIF o WebP.",
		}),
		fileTooLarge: t({
			en: "File size exceeds maximum allowed size (10 MB)",
			es: "El tamaño del archivo excede el máximo permitido (10 MB)",
		}),
		uploadFailed: t({
			en: "Failed to upload image",
			es: "Error al subir la imagen",
		}),
		saveArticle: t({
			en: "Save Article",
			es: "Guardar artículo",
		}),
		discard: t({
			en: "Discard",
			es: "Descartar",
		}),
		discardDraft: t({
			en: "Discard Draft",
			es: "Descartar borrador",
		}),
		discardDraftConfirmTitle: t({
			en: "Discard Draft",
			es: "Descartar borrador",
		}),
		discardDraftConfirmDescription: t({
			en: "Are you sure you want to discard this draft? This action cannot be undone.",
			es: "¿Estás seguro de que quieres descartar este borrador? Esta acción no se puede deshacer.",
		}),
		discardDraftCancel: t({
			en: "Cancel",
			es: "Cancelar",
		}),
		discardDraftConfirm: t({
			en: "Discard",
			es: "Descartar",
		}),
		deleteArticle: t({
			en: "Delete article",
			es: "Eliminar artículo",
		}),
		deleteArticleConfirmTitle: t({
			en: "Delete Article",
			es: "Eliminar artículo",
		}),
		deleteArticleConfirmDescription: t({
			en: "Are you sure you want to delete this article? It will be moved to the trash.",
			es: "¿Estás seguro de que quieres eliminar este artículo? Se moverá a la papelera.",
		}),
		deleteArticleCancel: t({
			en: "Cancel",
			es: "Cancelar",
		}),
		deleteArticleConfirm: t({
			en: "Delete",
			es: "Eliminar",
		}),
		deleteArticleError: t({
			en: "Failed to delete article",
			es: "Error al eliminar el artículo",
		}),
		showToolbar: t({
			en: "Show toolbar",
			es: "Mostrar barra de herramientas",
		}),
		hideToolbar: t({
			en: "Hide toolbar",
			es: "Ocultar barra de herramientas",
		}),
		agentPanel: t({
			en: "Jolli Agent",
			es: "Agente Jolli",
		}),
		aiWritingAssistant: t({
			en: "AI Writing Assistant",
			es: "Asistente de escritura IA",
		}),
		aiTyping: t({
			en: "AI is working",
			es: "IA está trabajando",
		}),
		writingArticle: t({
			en: "Writing article",
			es: "Escribiendo artículo",
		}),
		startConversation: t({
			en: "Start a conversation with the AI to edit your article",
			es: "Inicia una conversación con la IA para editar tu artículo",
		}),
		errorSending: t({
			en: "Error sending message",
			es: "Error al enviar el mensaje",
		}),
		quickSuggestions: t({
			en: "Quick suggestions",
			es: "Sugerencias rápidas",
		}),
		suggestionImproveIntro: t({
			en: "Improve the introduction",
			es: "Mejorar la introducción",
		}),
		suggestionAddExamples: t({
			en: "Add more examples",
			es: "Añadir más ejemplos",
		}),
		suggestionCheckOutdated: t({
			en: "Check for outdated info",
			es: "Revisar información obsoleta",
		}),
		suggestionSimplifyTerms: t({
			en: "Simplify technical terms",
			es: "Simplificar términos técnicos",
		}),
		askJolliAnything: t({
			en: "Ask Jolli anything...",
			es: "Pregunta lo que quieras a Jolli...",
		}),
		moveToLeftSide: t({
			en: "Move to left side",
			es: "Mover al lado izquierdo",
		}),
		moveToRightSide: t({
			en: "Move to right side",
			es: "Mover al lado derecho",
		}),
		toolCall: t({
			en: insert("Running {{toolName}}({{args}})"),
			es: insert("Ejecutando {{toolName}}({{args}})"),
		}),
		toolCallRunning: t({
			en: insert("Running the {{toolName}} tool"),
			es: insert("Ejecutando la herramienta {{toolName}}"),
		}),
		toolCallCompleted: t({
			en: insert("Running the {{toolName}} tool: completed"),
			es: insert("Ejecutando la herramienta {{toolName}}: completado"),
		}),
		showDetails: t({
			en: "Show details",
			es: "Mostrar detalles",
		}),
		hideDetails: t({
			en: "Hide details",
			es: "Ocultar detalles",
		}),
	},
} satisfies Dictionary;

export default articleDraftContent;

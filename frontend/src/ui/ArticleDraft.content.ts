import { type Dictionary, insert, t } from "intlayer";

const articleDraftContent = {
	key: "article-draft",
	content: {
		aiAssistant: t({
			en: "AI Assistant",
			es: "Asistente de IA",
		}),
		aiTyping: t({
			en: "AI is working",
			es: "IA está trabajando",
		}),
		articleContent: t({
			en: "Article Content",
			es: "Contenido del artículo",
		}),
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
		errorSending: t({
			en: "Error sending message",
			es: "Error al enviar el mensaje",
		}),
		startConversation: t({
			en: "Start a conversation with the AI to edit your article",
			es: "Inicia una conversación con la IA para editar tu artículo",
		}),
		typeMessage: t({
			en: "Type a message",
			es: "Escribe un mensaje",
		}),
		untitledDraft: t({
			en: "Untitled Draft",
			es: "Borrador sin título",
		}),
		save: t({
			en: "Save Article",
			es: "Guardar artículo",
		}),
		saveChanges: t({
			en: "Save Changes",
			es: "Guardar cambios",
		}),
		saving: t({
			en: "Saving",
			es: "Guardando",
		}),
		editingArticle: t({
			en: "Editing:",
			es: "Editando:",
		}),
		preview: t({
			en: "Preview",
			es: "Vista previa",
		}),
		edit: t({
			en: "Edit",
			es: "Editar",
		}),
		contentPlaceholder: t({
			en: "# Start writing your article",
			es: "# Comienza a escribir tu artículo",
		}),
		lastEdited: t({
			en: "Last Edited:",
			es: "Última edición:",
		}),
		noEditsYet: t({
			en: "No edits yet",
			es: "Sin ediciones aún",
		}),
		toolExecuting: t({
			en: "Working",
			es: "Trabajando",
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
		writingArticle: t({
			en: "Writing article",
			es: "Escribiendo artículo",
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
		suggestedEdits: t({
			en: "Suggested Edits",
			es: "Ediciones sugeridas",
		}),
		validating: t({
			en: "Validating...",
			es: "Validando...",
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
		shareSuccess: t({
			en: "Draft shared successfully",
			es: "Borrador compartido con éxito",
		}),
		shareError: t({
			en: "Error sharing draft",
			es: "Error al compartir el borrador",
		}),
		versionHistory: t({
			en: "Version History",
			es: "Historial de versiones",
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
	},
} satisfies Dictionary;

export default articleDraftContent;

import { type Dictionary, insert, t } from "intlayer";

const spaceSettingsContent = {
	key: "space-settings",
	content: {
		// Sidebar
		backToSpace: t({
			en: insert("Back to {{spaceName}}"),
			es: insert("Volver a {{spaceName}}"),
		}),
		spaceSettingsTitle: t({
			en: "Space Settings",
			es: "Configuración del espacio",
		}),
		generalTab: t({
			en: "General",
			es: "General",
		}),
		sourcesTab: t({
			en: "Sources",
			es: "Fuentes",
		}),
		membersTab: t({
			en: "Members",
			es: "Miembros",
		}),

		// General Settings Page
		generalTitle: t({
			en: "General",
			es: "General",
		}),
		generalDescription: t({
			en: "Manage your space settings.",
			es: "Administra la configuración de tu espacio.",
		}),

		// Space Name
		spaceNameLabel: t({
			en: "Space Name",
			es: "Nombre del espacio",
		}),
		spaceNameHint: t({
			en: "This name is visible to all members.",
			es: "Este nombre es visible para todos los miembros.",
		}),
		spaceNamePlaceholder: t({
			en: "Enter space name",
			es: "Ingresa el nombre del espacio",
		}),
		spaceNameEmptyError: t({
			en: "Space name cannot be empty",
			es: "El nombre del espacio no puede estar vacío",
		}),

		// Description
		descriptionLabel: t({
			en: "Description",
			es: "Descripción",
		}),
		descriptionHint: t({
			en: "A brief description of what this space is for.",
			es: "Una breve descripción del propósito de este espacio.",
		}),
		noDescription: t({
			en: "No description",
			es: "Sin descripción",
		}),
		descriptionPlaceholder: t({
			en: "Enter space description",
			es: "Ingresa la descripción del espacio",
		}),

		// Common Actions
		save: t({
			en: "Save",
			es: "Guardar",
		}),
		cancel: t({
			en: "Cancel",
			es: "Cancelar",
		}),
		edit: t({
			en: "Edit",
			es: "Editar",
		}),

		// Danger Zone
		dangerZoneTitle: t({
			en: "Danger Zone",
			es: "Zona de peligro",
		}),
		dangerZoneDescription: t({
			en: "Irreversible and destructive actions.",
			es: "Acciones irreversibles y destructivas.",
		}),
		deleteSpaceTitle: t({
			en: "Delete this space",
			es: "Eliminar este espacio",
		}),
		deleteSpaceDescription: t({
			en: "Once deleted, this space cannot be recovered.",
			es: "Una vez eliminado, este espacio no se puede recuperar.",
		}),
		deleteSpaceButton: t({
			en: "Delete Space",
			es: "Eliminar espacio",
		}),
		lastSpaceWarning: t({
			en: "You must have at least one space. Create another space before deleting this one.",
			es: "Debes tener al menos un espacio. Crea otro espacio antes de eliminar este.",
		}),

		// Delete Dialog - Step 1
		deleteDialogTitle: t({
			en: insert('Delete "{{spaceName}}"'),
			es: insert('Eliminar "{{spaceName}}"'),
		}),
		deleteDialogDescription: t({
			en: "What would you like to do with the folders and articles in this space?",
			es: "¿Qué te gustaría hacer con las carpetas y artículos de este espacio?",
		}),
		moveToAnotherSpace: t({
			en: "Move to another space",
			es: "Mover a otro espacio",
		}),
		moveToAnotherSpaceDescription: t({
			en: "All folders and articles will be moved to the selected space.",
			es: "Todas las carpetas y artículos se moverán al espacio seleccionado.",
		}),
		deleteAllContent: t({
			en: "Delete all content",
			es: "Eliminar todo el contenido",
		}),
		deleteAllContentDescription: t({
			en: "All folders and articles in this space will be permanently deleted.",
			es: "Todas las carpetas y artículos de este espacio se eliminarán permanentemente.",
		}),
		selectSpacePlaceholder: t({
			en: "Select a space...",
			es: "Selecciona un espacio...",
		}),
		continueButton: t({
			en: "Continue",
			es: "Continuar",
		}),

		// Delete Dialog - Step 2
		confirmDeleteTitle: t({
			en: "Are you absolutely sure?",
			es: "¿Estás completamente seguro?",
		}),
		confirmDeleteWarning: t({
			en: insert('This action cannot be undone. This will permanently delete the space "{{spaceName}}".'),
			es: insert('Esta acción no se puede deshacer. Esto eliminará permanentemente el espacio "{{spaceName}}".'),
		}),
		// Split warning text for bold styling
		warningPrefix: t({
			en: "This action ",
			es: "Esta acción ",
		}),
		warningCannotBeUndone: t({
			en: "cannot be undone",
			es: "no se puede deshacer",
		}),
		warningSuffix: t({
			en: insert('. This will permanently delete the space "{{spaceName}}".'),
			es: insert('. Esto eliminará permanentemente el espacio "{{spaceName}}".'),
		}),
		contentWillBeMoved: t({
			en: insert('All folders and articles will be moved to "{{targetSpaceName}}".'),
			es: insert('Todas las carpetas y artículos se moverán a "{{targetSpaceName}}".'),
		}),
		contentWillBeDeleted: t({
			en: "All folders and articles in this space will be permanently deleted.",
			es: "Todas las carpetas y artículos de este espacio se eliminarán permanentemente.",
		}),
		confirmDeletePrompt: t({
			en: insert('To confirm, type "{{spaceName}}" below:'),
			es: insert('Para confirmar, escribe "{{spaceName}}" a continuación:'),
		}),
		confirmDeleteButton: t({
			en: "Delete Space",
			es: "Eliminar espacio",
		}),

		// Toast messages
		spaceRenamed: t({
			en: insert('Space renamed to "{{spaceName}}"'),
			es: insert('Espacio renombrado a "{{spaceName}}"'),
		}),
		descriptionUpdated: t({
			en: "Description updated",
			es: "Descripción actualizada",
		}),
		spaceDeleted: t({
			en: "Space deleted",
			es: "Espacio eliminado",
		}),
		contentMoved: t({
			en: insert('Space deleted. Content moved to "{{targetSpaceName}}"'),
			es: insert('Espacio eliminado. Contenido movido a "{{targetSpaceName}}"'),
		}),
		updateFailed: t({
			en: "Failed to update space",
			es: "Error al actualizar el espacio",
		}),
		deleteFailed: t({
			en: "Failed to delete space",
			es: "Error al eliminar el espacio",
		}),

		// Sources Settings Page
		sourcesTitle: t({
			en: "Sources",
			es: "Fuentes",
		}),
		sourcesDescription: t({
			en: "Connect integrations to this space. When code changes are pushed to a connected repo, impact analysis runs automatically.",
			es: "Conecta integraciones a este espacio. Cuando se envían cambios de código a un repositorio conectado, el análisis de impacto se ejecuta automáticamente.",
		}),
		addSource: t({
			en: "Add Source",
			es: "Agregar fuente",
		}),
		connectedSources: t({
			en: "Connected Sources",
			es: "Fuentes conectadas",
		}),
		noSourcesTitle: t({
			en: "No sources connected",
			es: "Sin fuentes conectadas",
		}),
		noSourcesDescription: t({
			en: "Add a source to enable automatic impact analysis when code changes are pushed.",
			es: "Agrega una fuente para habilitar el análisis de impacto automático cuando se envían cambios de código.",
		}),
		selectSourcePlaceholder: t({
			en: "Select a source...",
			es: "Selecciona una fuente...",
		}),
		noAvailableSources: t({
			en: "No available sources. Create a source first from the API.",
			es: "No hay fuentes disponibles. Primero crea una fuente desde la API.",
		}),
		sourceAdded: t({
			en: "Source added",
			es: "Fuente agregada",
		}),
		sourceRemoved: t({
			en: "Source removed",
			es: "Fuente eliminada",
		}),
		sourceToggled: t({
			en: "Source updated",
			es: "Fuente actualizada",
		}),
		sourceAddFailed: t({
			en: "Failed to add source",
			es: "Error al agregar la fuente",
		}),
		sourceRemoveFailed: t({
			en: "Failed to remove source",
			es: "Error al eliminar la fuente",
		}),
		sourceToggleFailed: t({
			en: "Failed to update source",
			es: "Error al actualizar la fuente",
		}),
		confirmRemoveSource: t({
			en: "Remove this source from the space?",
			es: "¿Eliminar esta fuente del espacio?",
		}),
		enabled: t({
			en: "Enabled",
			es: "Habilitado",
		}),
		disabled: t({
			en: "Disabled",
			es: "Deshabilitado",
		}),

		neverProcessed: t({
			en: "Never processed",
			es: "Nunca procesado",
		}),

		// Personal space restrictions
		personalSpaceNameHint: t({
			en: "Personal space names cannot be changed.",
			es: "Los nombres de espacios personales no se pueden cambiar.",
		}),
		personalSpaceDescriptionHint: t({
			en: "Personal space descriptions cannot be changed.",
			es: "Las descripciones de espacios personales no se pueden cambiar.",
		}),
		personalSpaceDeleteWarning: t({
			en: "Personal spaces cannot be deleted.",
			es: "Los espacios personales no se pueden eliminar.",
		}),

		// Error states
		spaceNotFound: t({
			en: "Space not found",
			es: "Espacio no encontrado",
		}),
	},
} satisfies Dictionary;

export default spaceSettingsContent;

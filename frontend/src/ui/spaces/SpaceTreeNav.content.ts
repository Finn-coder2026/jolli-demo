import { type Dictionary, insert, t } from "intlayer";

const spaceTreeNavContent = {
	key: "space-tree-nav",
	content: {
		collapseSidebar: t({
			en: "Collapse sidebar",
			es: "Contraer barra lateral",
		}),
		createFolder: t({
			en: "New Folder",
			es: "Nueva Carpeta",
		}),
		createDoc: t({
			en: "New Article",
			es: "Nuevo Artículo",
		}),
		newFolderTitle: t({
			en: "New Folder",
			es: "Nueva Carpeta",
		}),
		newDocTitle: t({
			en: "New Article",
			es: "Nuevo Artículo",
		}),
		newFolderSubtitle: t({
			en: "Enter a name for your new folder",
			es: "Ingrese un nombre para su nueva carpeta",
		}),
		newArticleSubtitle: t({
			en: "Enter a name for your new article",
			es: "Ingrese un nombre para su nuevo artículo",
		}),
		folderNamePlaceholder: t({
			en: "Folder name...",
			es: "Nombre de carpeta...",
		}),
		docNamePlaceholder: t({
			en: "Article title...",
			es: "Título del artículo...",
		}),
		parentFolderLabel: t({
			en: "Parent Folder",
			es: "Carpeta Principal",
		}),
		rootFolder: t({
			en: "(Root)",
			es: "(Raíz)",
		}),
		typeLabel: t({
			en: "Document Type",
			es: "Tipo de documento",
		}),
		typeMarkdown: t({
			en: "Markdown",
			es: "Markdown",
		}),
		typeJson: t({
			en: "OpenAPI Specification (JSON)",
			es: "Especificación OpenAPI (JSON)",
		}),
		typeYaml: t({
			en: "OpenAPI Specification (YAML)",
			es: "Especificación OpenAPI (YAML)",
		}),
		typeDescription: t({
			en: "Choose Markdown for documentation articles, or OpenAPI format for API specifications.",
			es: "Elija Markdown para artículos de documentación, o formato OpenAPI para especificaciones de API.",
		}),
		cancel: t({
			en: "Cancel",
			es: "Cancelar",
		}),
		create: t({
			en: "Create",
			es: "Crear",
		}),
		delete: t({
			en: "Delete",
			es: "Eliminar",
		}),
		trash: t({
			en: "Trash",
			es: "Papelera",
		}),
		trashEmpty: t({
			en: "Trash is empty",
			es: "La papelera está vacía",
		}),
		loading: t({
			en: "Loading...",
			es: "Cargando...",
		}),
		empty: t({
			en: "No documents yet",
			es: "Aún no hay documentos",
		}),
		emptyTreeDescription: t({
			en: "Create your first folder or document to get started.",
			es: "Crea tu primera carpeta o documento para comenzar.",
		}),
		trashEmptyDescription: t({
			en: "Deleted items will appear here.",
			es: "Los elementos eliminados aparecerán aquí.",
		}),
		restore: t({
			en: "Restore",
			es: "Restaurar",
		}),
		deleteConfirmTitle: t({
			en: insert('Delete "{{name}}"?'),
			es: insert('¿Eliminar "{{name}}"?'),
		}),
		deleteDocDescription: t({
			en: "This will move the document to trash. You can restore it later.",
			es: "Esto moverá el documento a la papelera. Puede restaurarlo más tarde.",
		}),
		deleteEmptyFolderDescription: t({
			en: "This will move the folder to trash. You can restore it later.",
			es: "Esto moverá la carpeta a la papelera. Puede restaurarla más tarde.",
		}),
		deleteFolderWithContentsDescription: t({
			en: insert("This will move the folder and all {{count}} items to trash. You can restore them later."),
			es: insert(
				"Esto moverá la carpeta y todos los {{count}} elementos a la papelera. Puede restaurarlos más tarde.",
			),
		}),
		confirmDelete: t({
			en: "Delete",
			es: "Eliminar",
		}),
		rename: t({
			en: "Rename",
			es: "Renombrar",
		}),
		renameFolderTitle: t({
			en: "Rename Folder",
			es: "Renombrar Carpeta",
		}),
		renameDocTitle: t({
			en: "Rename Article",
			es: "Renombrar Artículo",
		}),
		renameFolderSubtitle: t({
			en: "Enter a new name for the folder",
			es: "Ingrese un nuevo nombre para la carpeta",
		}),
		renameDocSubtitle: t({
			en: "Enter a new name for the article",
			es: "Ingrese un nuevo nombre para el artículo",
		}),
		nameLabel: t({
			en: "Name",
			es: "Nombre",
		}),
		save: t({
			en: "Save",
			es: "Guardar",
		}),
		nameEmptyError: t({
			en: "Name cannot be empty",
			es: "El nombre no puede estar vacío",
		}),
		nameInvalidCharsError: t({
			en: 'Name cannot contain: / \\ : * ? " < > |',
			es: 'El nombre no puede contener: / \\ : * ? " < > |',
		}),
		// Sort menu
		sortButton: t({
			en: "Sort",
			es: "Ordenar",
		}),
		spaceDefault: t({
			en: "Space default",
			es: "Predeterminado del espacio",
		}),
		resetToDefault: t({
			en: "Reset to default",
			es: "Restablecer a predeterminado",
		}),
		saveAsSpaceDefault: t({
			en: "Save as space default",
			es: "Guardar como predeterminado del espacio",
		}),
		appliesToAllMembers: t({
			en: "Applies to all space members",
			es: "Se aplica a todos los miembros del espacio",
		}),
		spaceDefaultSortSaved: t({
			en: insert("Default sort saved: {{sortMode}}"),
			es: insert("Orden predeterminado guardado: {{sortMode}}"),
		}),
		sortDefault: t({
			en: "Default",
			es: "Predeterminado",
		}),
		sortAlphabeticalAsc: t({
			en: "Alphabetical A→Z",
			es: "Alfabético A→Z",
		}),
		sortAlphabeticalDesc: t({
			en: "Alphabetical Z→A",
			es: "Alfabético Z→A",
		}),
		sortUpdatedDesc: t({
			en: "Last Updated (Newest)",
			es: "Última actualización (más reciente)",
		}),
		sortUpdatedAsc: t({
			en: "Last Updated (Oldest)",
			es: "Última actualización (más antigua)",
		}),
		sortCreatedDesc: t({
			en: "Created (Newest)",
			es: "Creado (más reciente)",
		}),
		sortCreatedAsc: t({
			en: "Created (Oldest)",
			es: "Creado (más antigua)",
		}),
		// Move Up/Down
		moveUp: t({
			en: "Move Up",
			es: "Mover arriba",
		}),
		moveDown: t({
			en: "Move Down",
			es: "Mover abajo",
		}),
		// Move To
		moveTo: t({
			en: "Move to...",
			es: "Mover a...",
		}),
		moveItemTitle: t({
			en: insert('Move "{{name}}"'),
			es: insert('Mover "{{name}}"'),
		}),
		moveItemSubtitle: t({
			en: "Choose a new location for this item",
			es: "Elija una nueva ubicación para este elemento",
		}),
		move: t({
			en: "Move",
			es: "Mover",
		}),
		moveSuccess: t({
			en: insert('"{{name}}" moved successfully'),
			es: insert('"{{name}}" movido exitosamente'),
		}),
		moveFailed: t({
			en: "Failed to move item",
			es: "Error al mover el elemento",
		}),
		moveItemSameLocationWarning: t({
			en: "This item is already in the selected location. Please choose a different folder.",
			es: "Este elemento ya está en la ubicación seleccionada. Por favor, elija una carpeta diferente.",
		}),
		// Drag and drop
		dragToReorder: t({
			en: "Drag to reorder",
			es: "Arrastrar para reordenar",
		}),
		dragToMove: t({
			en: "Drag to move",
			es: "Arrastrar para mover",
		}),
		reorderFailed: t({
			en: "Failed to reorder item",
			es: "Error al reordenar el elemento",
		}),
		renameFailed: t({
			en: "Failed to rename item",
			es: "Error al renombrar el elemento",
		}),
		deleteFailed: t({
			en: "Failed to delete item",
			es: "Error al eliminar el elemento",
		}),
		errorRolledBack: t({
			en: "Your changes were not saved",
			es: "Tus cambios no se guardaron",
		}),
		// Create operations
		createFolderSuccess: t({
			en: insert('"{{name}}" created successfully'),
			es: insert('"{{name}}" creada exitosamente'),
		}),
		createFolderFailed: t({
			en: "Failed to create folder",
			es: "Error al crear la carpeta",
		}),
		createDocSuccess: t({
			en: insert('"{{name}}" created successfully'),
			es: insert('"{{name}}" creado exitosamente'),
		}),
		createDocFailed: t({
			en: "Failed to create article",
			es: "Error al crear el artículo",
		}),
		// Delete operations
		deleteSuccess: t({
			en: insert('"{{name}}" moved to trash'),
			es: insert('"{{name}}" movido a la papelera'),
		}),
		// Rename operations
		renameSuccess: t({
			en: insert('"{{name}}" renamed successfully'),
			es: insert('"{{name}}" renombrado exitosamente'),
		}),
		// Reorder operations
		reorderSuccess: t({
			en: "Item reordered successfully",
			es: "Elemento reordenado exitosamente",
		}),
		// Restore operations
		restoreSuccess: t({
			en: insert('"{{name}}" restored successfully'),
			es: insert('"{{name}}" restaurado exitosamente'),
		}),
		restoreFailed: t({
			en: "Failed to restore item",
			es: "Error al restaurar el elemento",
		}),
		// Filter menu
		filtersButton: t({
			en: "Filters",
			es: "Filtros",
		}),
		filterUpdated: t({
			en: "Updated Last",
			es: "Última actualización",
		}),
		filterCreator: t({
			en: "Contributor",
			es: "Colaborador",
		}),
		filterAnyTime: t({
			en: "Any time",
			es: "Cualquier momento",
		}),
		filterToday: t({
			en: "Today",
			es: "Hoy",
		}),
		filterLast7Days: t({
			en: "Last 7 days",
			es: "Últimos 7 días",
		}),
		filterLast30Days: t({
			en: "Last 30 days",
			es: "Últimos 30 días",
		}),
		filterLast3Months: t({
			en: "Last 3 months",
			es: "Últimos 3 meses",
		}),
		filterAfterDate: t({
			en: "After specific date",
			es: "Después de fecha específica",
		}),
		filterAfterDateFormat: t({
			en: insert("After {{date}}"),
			es: insert("Después del {{date}}"),
		}),
		filterCreatorAll: t({
			en: "All",
			es: "Todos",
		}),
		filterCreatorPlaceholder: t({
			en: "Search contributors...",
			es: "Buscar colaboradores...",
		}),
		spaceDefaultFilters: t({
			en: "Space default",
			es: "Predeterminado del espacio",
		}),
		spaceDefaultFiltersSaved: t({
			en: insert("Default filters saved: {{description}}"),
			es: insert("Filtros predeterminados guardados: {{description}}"),
		}),
		filterNone: t({
			en: "None",
			es: "Ninguno",
		}),
		defaultFiltersTooltipTitle: t({
			en: "Default filters for this space",
			es: "Configuración de filtros predeterminados",
		}),
		filtersSingular: t({
			en: "filter",
			es: "filtro",
		}),
		filtersPlural: t({
			en: "filters",
			es: "filtros",
		}),
		// Suggestion indicator
		hasSuggestedUpdates: t({
			en: "Has suggested updates",
			es: "Tiene actualizaciones sugeridas",
		}),
		// Add items to folder (shown in action menu)
		newFolder: t({
			en: "New Folder",
			es: "Nueva Carpeta",
		}),
		newArticle: t({
			en: "New Article",
			es: "Nuevo Artículo",
		}),
		untitledArticle: t({
			en: "Untitled",
			es: "Sin título",
		}),
		// Settings
		settings: t({
			en: "Settings",
			es: "Configuración",
		}),
	},
} satisfies Dictionary;

export default spaceTreeNavContent;

import { type Dictionary, t } from "intlayer";

const repositoryViewerContent = {
	key: "repository-viewer",
	content: {
		title: t({
			en: "Repository Contents",
			es: "Contenidos del Repositorio",
		}),
		branch: t({
			en: "Branch",
			es: "Rama",
		}),
		lastSynced: t({
			en: "Last synced",
			es: "Última sincronización",
		}),
		syncNow: t({
			en: "Sync Now",
			es: "Sincronizar Ahora",
		}),
		loading: t({
			en: "Loading repository contents...",
			es: "Cargando contenidos del repositorio...",
		}),
		noFiles: t({
			en: "No files found",
			es: "No se encontraron archivos",
		}),
		error: t({
			en: "Failed to load repository contents",
			es: "Error al cargar contenidos del repositorio",
		}),
		selectFile: t({
			en: "Select a file to view its contents",
			es: "Selecciona un archivo para ver su contenido",
		}),
		bytes: t({
			en: "bytes",
			es: "bytes",
		}),
		folder: t({
			en: "Folder",
			es: "Carpeta",
		}),
		file: t({
			en: "File",
			es: "Archivo",
		}),
		editFile: t({
			en: "Edit File",
			es: "Editar Archivo",
		}),
		saveFile: t({
			en: "Save File",
			es: "Guardar Archivo",
		}),
		cancel: t({
			en: "Cancel",
			es: "Cancelar",
		}),
		saving: t({
			en: "Saving...",
			es: "Guardando...",
		}),
		saveSuccess: t({
			en: "File saved successfully",
			es: "Archivo guardado exitosamente",
		}),
		saveError: t({
			en: "Failed to save file",
			es: "Error al guardar archivo",
		}),
		readOnlyFile: t({
			en: "Read only - managed by Jolli",
			es: "Solo lectura - administrado por Jolli",
		}),
		syntaxError: t({
			en: "Syntax Error",
			es: "Error de Sintaxis",
		}),
		// Consistency validation messages
		orphanedEntryMsg: t({
			en: "Entry in _meta.ts has no matching article file",
			es: "Entrada en _meta.ts no tiene archivo de artículo correspondiente",
		}),
		missingEntryMsg: t({
			en: "Article file not listed in _meta.ts",
			es: "Archivo de artículo no listado en _meta.ts",
		}),
		issuesTitle: t({
			en: "Issues",
			es: "Problemas",
		}),
		errorCount: t({
			en: "error(s)",
			es: "error(es)",
		}),
		warningCount: t({
			en: "warning(s)",
			es: "advertencia(s)",
		}),
		formatCode: t({
			en: "Format",
			es: "Formatear",
		}),
		formatting: t({
			en: "Formatting...",
			es: "Formateando...",
		}),
		formatSuccess: t({
			en: "File formatted",
			es: "Archivo formateado",
		}),
		formatError: t({
			en: "Failed to format file",
			es: "Error al formatear archivo",
		}),
		// Folder context menu
		newFolder: t({
			en: "New Folder",
			es: "Nueva Carpeta",
		}),
		renameFolder: t({
			en: "Rename Folder",
			es: "Renombrar Carpeta",
		}),
		deleteFolder: t({
			en: "Delete Folder",
			es: "Eliminar Carpeta",
		}),
		// Folder operation dialogs
		newFolderTitle: t({
			en: "Create New Folder",
			es: "Crear Nueva Carpeta",
		}),
		newFolderPlaceholder: t({
			en: "Folder name",
			es: "Nombre de carpeta",
		}),
		renameFolderTitle: t({
			en: "Rename Folder",
			es: "Renombrar Carpeta",
		}),
		deleteFolderTitle: t({
			en: "Delete Folder",
			es: "Eliminar Carpeta",
		}),
		deleteFolderConfirm: t({
			en: "Are you sure you want to delete this folder? This action cannot be undone.",
			es: "¿Está seguro de que desea eliminar esta carpeta? Esta acción no se puede deshacer.",
		}),
		deleteFolderNonEmpty: t({
			en: "This folder contains files. Deleting it will also delete all files inside.",
			es: "Esta carpeta contiene archivos. Al eliminarla también se eliminarán todos los archivos.",
		}),
		create: t({
			en: "Create",
			es: "Crear",
		}),
		rename: t({
			en: "Rename",
			es: "Renombrar",
		}),
		delete: t({
			en: "Delete",
			es: "Eliminar",
		}),
		folderCreated: t({
			en: "Folder created successfully",
			es: "Carpeta creada exitosamente",
		}),
		folderRenamed: t({
			en: "Folder renamed successfully",
			es: "Carpeta renombrada exitosamente",
		}),
		folderDeleted: t({
			en: "Folder deleted successfully",
			es: "Carpeta eliminada exitosamente",
		}),
		folderCreateError: t({
			en: "Failed to create folder",
			es: "Error al crear carpeta",
		}),
		folderRenameError: t({
			en: "Failed to rename folder",
			es: "Error al renombrar carpeta",
		}),
		folderDeleteError: t({
			en: "Failed to delete folder",
			es: "Error al eliminar carpeta",
		}),
		folderCreationRestricted: t({
			en: "Cannot create folders in this directory",
			es: "No se pueden crear carpetas en este directorio",
		}),
		fileCreationRestricted: t({
			en: "Cannot create files in this directory",
			es: "No se pueden crear archivos en este directorio",
		}),
		// New file context menu and dialog
		newFile: t({
			en: "New File",
			es: "Nuevo Archivo",
		}),
		newFileTitle: t({
			en: "Create New File",
			es: "Crear Nuevo Archivo",
		}),
		newFilePlaceholder: t({
			en: "File name (without extension)",
			es: "Nombre de archivo (sin extensión)",
		}),
		fileCreated: t({
			en: "File created successfully",
			es: "Archivo creado exitosamente",
		}),
		fileCreateError: t({
			en: "Failed to create file",
			es: "Error al crear archivo",
		}),
		// File context menu
		moveFile: t({
			en: "Move to...",
			es: "Mover a...",
		}),
		moveFileTitle: t({
			en: "Move File",
			es: "Mover Archivo",
		}),
		selectDestination: t({
			en: "Select destination folder",
			es: "Selecciona carpeta de destino",
		}),
		currentLocation: t({
			en: "Current location",
			es: "Ubicación actual",
		}),
		moveTo: t({
			en: "Move",
			es: "Mover",
		}),
		fileMoved: t({
			en: "File moved successfully",
			es: "Archivo movido exitosamente",
		}),
		moveFileError: t({
			en: "Failed to move file",
			es: "Error al mover archivo",
		}),
		// Root level file creation
		creatingAtRootConfig: t({
			en: "Only Nextra config files can be created at root level",
			es: "Solo se pueden crear archivos de configuración Nextra a nivel raíz",
		}),
		selectConfigFile: t({
			en: "Select a config file...",
			es: "Seleccionar archivo de configuración...",
		}),
		allConfigFilesExist: t({
			en: "All available config files already exist",
			es: "Todos los archivos de configuración disponibles ya existen",
		}),
		// Content folder meta file creation
		selectMetaFile: t({
			en: "Select a _meta file...",
			es: "Seleccionar archivo _meta...",
		}),
		allMetaFilesExist: t({
			en: "A _meta file already exists in this folder",
			es: "Ya existe un archivo _meta en esta carpeta",
		}),
	},
} satisfies Dictionary;

export default repositoryViewerContent;

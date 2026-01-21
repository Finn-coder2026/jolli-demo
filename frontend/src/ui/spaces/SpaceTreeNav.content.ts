import { type Dictionary, insert, t } from "intlayer";

const spaceTreeNavContent = {
	key: "space-tree-nav",
	content: {
		createFolder: t({
			en: "New Folder",
			es: "Nueva Carpeta",
			zh: "新建文件夹",
		}),
		createDoc: t({
			en: "New Article",
			es: "Nuevo Artículo",
			zh: "新建文章",
		}),
		newFolderTitle: t({
			en: "New Folder",
			es: "Nueva Carpeta",
			zh: "新建文件夹",
		}),
		newDocTitle: t({
			en: "New Article",
			es: "Nuevo Artículo",
			zh: "新建文章",
		}),
		newFolderSubtitle: t({
			en: "Enter a name for your new folder",
			es: "Ingrese un nombre para su nueva carpeta",
			zh: "为新文件夹输入名称",
		}),
		newArticleSubtitle: t({
			en: "Enter a name for your new article",
			es: "Ingrese un nombre para su nuevo artículo",
			zh: "为新文章输入名称",
		}),
		folderNamePlaceholder: t({
			en: "Folder name...",
			es: "Nombre de carpeta...",
			zh: "文件夹名称...",
		}),
		docNamePlaceholder: t({
			en: "Article title...",
			es: "Título del artículo...",
			zh: "文章标题...",
		}),
		parentFolderLabel: t({
			en: "Parent Folder",
			es: "Carpeta Principal",
			zh: "父文件夹",
		}),
		rootFolder: t({
			en: "(Root)",
			es: "(Raíz)",
			zh: "(根目录)",
		}),
		typeLabel: t({
			en: "Document Type",
			es: "Tipo de documento",
			zh: "文档类型",
		}),
		typeMarkdown: t({
			en: "Markdown / MDX",
			es: "Markdown / MDX",
			zh: "Markdown / MDX",
		}),
		typeJson: t({
			en: "OpenAPI Specification (JSON)",
			es: "Especificación OpenAPI (JSON)",
			zh: "OpenAPI 规范 (JSON)",
		}),
		typeYaml: t({
			en: "OpenAPI Specification (YAML)",
			es: "Especificación OpenAPI (YAML)",
			zh: "OpenAPI 规范 (YAML)",
		}),
		typeDescription: t({
			en: "Choose Markdown for documentation articles, or OpenAPI format for API specifications.",
			es: "Elija Markdown para artículos de documentación, o formato OpenAPI para especificaciones de API.",
			zh: "选择 Markdown 用于文档文章，或 OpenAPI 格式用于 API 规范。",
		}),
		cancel: t({
			en: "Cancel",
			es: "Cancelar",
			zh: "取消",
		}),
		create: t({
			en: "Create",
			es: "Crear",
			zh: "创建",
		}),
		delete: t({
			en: "Delete",
			es: "Eliminar",
			zh: "删除",
		}),
		trash: t({
			en: "Trash",
			es: "Papelera",
			zh: "回收站",
		}),
		deletedItems: t({
			en: "Deleted Items",
			es: "Elementos eliminados",
			zh: "已删除项目",
		}),
		trashEmpty: t({
			en: "Trash is empty",
			es: "La papelera está vacía",
			zh: "回收站为空",
		}),
		loading: t({
			en: "Loading...",
			es: "Cargando...",
			zh: "加载中...",
		}),
		empty: t({
			en: "No documents yet",
			es: "Aún no hay documentos",
			zh: "暂无文档",
		}),
		emptyTreeDescription: t({
			en: "Create your first folder or document to get started.",
			es: "Crea tu primera carpeta o documento para comenzar.",
			zh: "创建您的第一个文件夹或文档以开始。",
		}),
		trashEmptyDescription: t({
			en: "Deleted items will appear here.",
			es: "Los elementos eliminados aparecerán aquí.",
			zh: "已删除的项目将显示在这里。",
		}),
		restore: t({
			en: "Restore",
			es: "Restaurar",
			zh: "恢复",
		}),
		deleteConfirmTitle: t({
			en: insert('Delete "{{name}}"?'),
			es: insert('¿Eliminar "{{name}}"?'),
			zh: insert('删除 "{{name}}"？'),
		}),
		deleteDocDescription: t({
			en: "This will move the document to trash. You can restore it later.",
			es: "Esto moverá el documento a la papelera. Puede restaurarlo más tarde.",
			zh: "此操作将把文档移至回收站。您可以稍后恢复。",
		}),
		deleteEmptyFolderDescription: t({
			en: "This will move the folder to trash. You can restore it later.",
			es: "Esto moverá la carpeta a la papelera. Puede restaurarla más tarde.",
			zh: "此操作将把文件夹移至回收站。您可以稍后恢复。",
		}),
		deleteFolderWithContentsDescription: t({
			en: insert("This will move the folder and all {{count}} items to trash. You can restore them later."),
			es: insert(
				"Esto moverá la carpeta y todos los {{count}} elementos a la papelera. Puede restaurarlos más tarde.",
			),
			zh: insert("此操作将把文件夹及其 {{count}} 个项目移至回收站。您可以稍后恢复。"),
		}),
		confirmDelete: t({
			en: "Delete",
			es: "Eliminar",
			zh: "删除",
		}),
		rename: t({
			en: "Rename",
			es: "Renombrar",
			zh: "重命名",
		}),
		renameFolderTitle: t({
			en: "Rename Folder",
			es: "Renombrar Carpeta",
			zh: "重命名文件夹",
		}),
		renameDocTitle: t({
			en: "Rename Article",
			es: "Renombrar Artículo",
			zh: "重命名文章",
		}),
		renameFolderSubtitle: t({
			en: "Enter a new name for the folder",
			es: "Ingrese un nuevo nombre para la carpeta",
			zh: "为文件夹输入新名称",
		}),
		renameDocSubtitle: t({
			en: "Enter a new name for the article",
			es: "Ingrese un nuevo nombre para el artículo",
			zh: "为文章输入新名称",
		}),
		nameLabel: t({
			en: "Name",
			es: "Nombre",
			zh: "名称",
		}),
		save: t({
			en: "Save",
			es: "Guardar",
			zh: "保存",
		}),
		nameEmptyError: t({
			en: "Name cannot be empty",
			es: "El nombre no puede estar vacío",
			zh: "名称不能为空",
		}),
		nameInvalidCharsError: t({
			en: 'Name cannot contain: / \\ : * ? " < > |',
			es: 'El nombre no puede contener: / \\ : * ? " < > |',
			zh: '名称不能包含: / \\ : * ? " < > |',
		}),
	},
} satisfies Dictionary;

export default spaceTreeNavContent;

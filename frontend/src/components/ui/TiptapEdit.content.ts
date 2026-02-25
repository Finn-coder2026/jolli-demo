import { type Dictionary, t } from "intlayer";

const tiptapEditContent = {
	key: "tiptap-edit",
	content: {
		toolbar: {
			bold: t({
				en: "Bold",
				es: "Negrita",
			}),
			italic: t({
				en: "Italic",
				es: "Cursiva",
			}),
			underline: t({
				en: "Underline",
				es: "Subrayado",
			}),
			strikethrough: t({
				en: "Strikethrough",
				es: "Tachado",
			}),
			inlineCode: t({
				en: "Inline Code",
				es: "Código en línea",
			}),
			codeBlock: t({
				en: "Code Block",
				es: "Bloque de código",
			}),
			highlight: t({
				en: "Highlight",
				es: "Resaltar",
			}),
			heading1: t({
				en: "Heading 1",
				es: "Encabezado 1",
			}),
			heading2: t({
				en: "Heading 2",
				es: "Encabezado 2",
			}),
			heading3: t({
				en: "Heading 3",
				es: "Encabezado 3",
			}),
			heading4: t({
				en: "Heading 4",
				es: "Encabezado 4",
			}),
			bulletList: t({
				en: "Bullet List",
				es: "Lista con viñetas",
			}),
			orderedList: t({
				en: "Ordered List",
				es: "Lista numerada",
			}),
			blockquote: t({
				en: "Blockquote",
				es: "Cita",
			}),
			paragraph: t({
				en: "Paragraph",
				es: "Párrafo",
			}),
			alignLeft: t({
				en: "Align Left",
				es: "Alinear a la izquierda",
			}),
			alignCenter: t({
				en: "Align Center",
				es: "Alinear al centro",
			}),
			alignRight: t({
				en: "Align Right",
				es: "Alinear a la derecha",
			}),
			link: t({
				en: "Link",
				es: "Enlace",
			}),
			image: t({
				en: "Image",
				es: "Imagen",
			}),
			mention: t({
				en: "Mention",
				es: "Mención",
			}),
			undo: t({
				en: "Undo",
				es: "Deshacer",
			}),
			redo: t({
				en: "Redo",
				es: "Rehacer",
			}),
			insertTable: t({
				en: "Insert Table",
				es: "Insertar tabla",
			}),
			deleteTable: t({
				en: "Delete Table",
				es: "Eliminar tabla",
			}),
			addColumnBefore: t({
				en: "Add Column Before",
				es: "Añadir columna antes",
			}),
			addColumnAfter: t({
				en: "Add Column After",
				es: "Añadir columna después",
			}),
			deleteColumn: t({
				en: "Delete Column",
				es: "Eliminar columna",
			}),
			addRowBefore: t({
				en: "Add Row Before",
				es: "Añadir fila antes",
			}),
			addRowAfter: t({
				en: "Add Row After",
				es: "Añadir fila después",
			}),
			deleteRow: t({
				en: "Delete Row",
				es: "Eliminar fila",
			}),
			mergeCells: t({
				en: "Merge Cells",
				es: "Combinar celdas",
			}),
			splitCell: t({
				en: "Split Cell",
				es: "Dividir celda",
			}),
			toggleHeaderColumn: t({
				en: "Toggle Header Column",
				es: "Alternar columna de encabezado",
			}),
			toggleHeaderRow: t({
				en: "Toggle Header Row",
				es: "Alternar fila de encabezado",
			}),
			toggleHeaderCell: t({
				en: "Toggle Header Cell",
				es: "Alternar celda de encabezado",
			}),
			enterUrl: t({
				en: "Enter URL:",
				es: "Introduce la URL:",
			}),
			horizontalRule: t({
				en: "Horizontal Rule",
				es: "Línea horizontal",
			}),
			more: t({
				en: "More",
				es: "Más",
			}),
		},
		collapseToolbar: t({
			en: "Collapse toolbar",
			es: "Contraer barra de herramientas",
		}),
		showToolbar: t({
			en: "Show toolbar",
			es: "Mostrar barra de herramientas",
		}),
		viewMode: {
			article: t({
				en: "Article",
				es: "Artículo",
			}),
			markdown: t({
				en: "Markdown",
				es: "Markdown",
			}),
			brain: t({
				en: "Brain",
				es: "Brain",
			}),
		},
		codeBlock: {
			language: t({
				en: "Language",
				es: "Idioma",
			}),
			searchLanguage: t({
				en: "Search language...",
				es: "Buscar idioma...",
			}),
			noLanguageFound: t({
				en: "No language found.",
				es: "No se encontró el idioma.",
			}),
		},
		dragHandle: {
			heading1: t({
				en: "Heading 1",
				es: "Encabezado 1",
			}),
			heading2: t({
				en: "Heading 2",
				es: "Encabezado 2",
			}),
			bold: t({
				en: "Bold",
				es: "Negrita",
			}),
			italic: t({
				en: "Italic",
				es: "Cursiva",
			}),
			bulletList: t({
				en: "Bullet List",
				es: "Lista con viñetas",
			}),
			orderedList: t({
				en: "Ordered List",
				es: "Lista numerada",
			}),
			codeBlock: t({
				en: "Code Block",
				es: "Bloque de código",
			}),
			deleteBlock: t({
				en: "Delete",
				es: "Eliminar",
			}),
		},
	},
} satisfies Dictionary;

export default tiptapEditContent;

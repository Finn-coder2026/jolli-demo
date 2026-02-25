import { type Dictionary, t } from "intlayer";

const floatingToolbarContent = {
	key: "floating-toolbar",
	content: {
		bold: t({ en: "Bold", es: "Negrita" }),
		italic: t({ en: "Italic", es: "Cursiva" }),
		underline: t({ en: "Underline", es: "Subrayado" }),
		strikethrough: t({ en: "Strikethrough", es: "Tachado" }),
		code: t({ en: "Code", es: "Código" }),
		link: t({ en: "Link", es: "Enlace" }),
		blockquote: t({ en: "Blockquote", es: "Cita" }),
		heading: t({ en: "Heading", es: "Encabezado" }),
		heading1: t({ en: "Heading 1", es: "Encabezado 1" }),
		heading2: t({ en: "Heading 2", es: "Encabezado 2" }),
		heading3: t({ en: "Heading 3", es: "Encabezado 3" }),
		heading4: t({ en: "Heading 4", es: "Encabezado 4" }),
		paragraph: t({ en: "Paragraph", es: "Párrafo" }),
		enterUrl: t({ en: "Enter URL:", es: "Introduce la URL:" }),
	},
} satisfies Dictionary;

export default floatingToolbarContent;

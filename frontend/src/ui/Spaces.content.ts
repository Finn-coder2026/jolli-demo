import { type Dictionary, t } from "intlayer";

const spacesContent = {
	key: "spaces",
	content: {
		selectDocument: t({
			en: "No document selected",
			es: "Ningún documento seleccionado",
			zh: "未选择文档",
		}),
		selectDocumentDescription: t({
			en: "Select a document from the tree to view and edit its content.",
			es: "Seleccione un documento del árbol para ver y editar su contenido.",
			zh: "从树中选择一个文档以查看和编辑其内容。",
		}),
	},
} satisfies Dictionary;

export default spacesContent;

import { type Dictionary, insert, t } from "intlayer";

const spacesContent = {
	key: "spaces",
	content: {
		selectDocument: t({
			en: "No document selected",
			es: "Ningún documento seleccionado",
		}),
		selectDocumentDescription: t({
			en: "Select a document from the tree to view and edit its content.",
			es: "Seleccione un documento del árbol para ver y editar su contenido.",
		}),
		expandTree: t({
			en: "Expand tree",
			es: "Expandir árbol",
		}),
		lastEdited: t({
			en: insert("Last edited by {{name}} on {{date}}"),
			es: insert("Última edición por {{name}} el {{date}}"),
		}),
		editButton: t({
			en: "Edit",
			es: "Editar",
		}),
		historyButton: t({
			en: "History",
			es: "Historial",
		}),
	},
} satisfies Dictionary;

export default spacesContent;

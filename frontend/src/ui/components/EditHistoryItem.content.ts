import { type Dictionary, t } from "intlayer";

const editHistoryItemContent = {
	key: "edit-history-item",
	content: {
		editTypeContent: t({ en: "Content edited", es: "Contenido editado" }),
		editTypeTitle: t({ en: "Title changed", es: "Título cambiado" }),
		editTypeSectionApply: t({ en: "Applied suggestion", es: "Sugerencia aplicada" }),
		editTypeSectionDismiss: t({ en: "Dismissed suggestion", es: "Sugerencia descartada" }),
	},
} satisfies Dictionary;

export default editHistoryItemContent;

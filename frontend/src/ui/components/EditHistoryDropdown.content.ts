import { type Dictionary, t } from "intlayer";

const editHistoryDropdownContent = {
	key: "edit-history-dropdown",
	content: {
		history: t({ en: "History", es: "Historial" }),
		noHistoryYet: t({ en: "No edit history yet", es: "Sin historial de ediciones" }),
	},
} satisfies Dictionary;

export default editHistoryDropdownContent;

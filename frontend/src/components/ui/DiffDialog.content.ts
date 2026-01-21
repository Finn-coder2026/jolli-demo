import { type Dictionary, t } from "intlayer";

const diffDialogContent = {
	key: "diff-dialog",
	content: {
		cancel: t({
			en: "Cancel",
			es: "Cancelar",
		}),
		confirm: t({
			en: "Restore",
			es: "Restaurar",
		}),
		noDiff: t({
			en: "No differences to display",
			es: "No hay diferencias para mostrar",
		}),
	},
} satisfies Dictionary;

export default diffDialogContent;

import { type Dictionary, t } from "intlayer";

const draftSelectionDialogContent = {
	key: "draft-selection-dialog",
	content: {
		title: t({
			en: "Unsaved Drafts Found",
			es: "Borradores sin guardar encontrados",
		}),
		subtitle: t({
			en: "You have unsaved drafts. Would you like to continue editing one of them or start a new article?",
			es: "Tienes borradores sin guardar. ¿Quieres continuar editando uno de ellos o comenzar un nuevo artículo?",
		}),
		lastEdited: t({
			en: "Last edited",
			es: "Última edición",
		}),
		createNew: t({
			en: "Start New Article",
			es: "Comenzar nuevo artículo",
		}),
		deleteButton: t({
			en: "Delete draft",
			es: "Eliminar borrador",
		}),
		confirmDelete: t({
			en: "Are you sure you want to delete this draft? This action cannot be undone.",
			es: "¿Estás seguro de que quieres eliminar este borrador? Esta acción no se puede deshacer.",
		}),
	},
} satisfies Dictionary;

export default draftSelectionDialogContent;

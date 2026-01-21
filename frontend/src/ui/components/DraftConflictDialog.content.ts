import { type Dictionary, insert, t } from "intlayer";

const draftConflictDialogContent = {
	key: "draft-conflict-dialog",
	content: {
		title: t({
			en: "Draft Already Exists",
			es: "El borrador ya existe",
		}),
		description: t({
			en: insert(
				'A draft named "{{title}}" already exists. To maintain collaboration, please join the existing draft instead of creating a new one.',
			),
			es: insert(
				'Ya existe un borrador llamado "{{title}}". Para mantener la colaboración, únase al borrador existente en lugar de crear uno nuevo.',
			),
		}),
		existingDraft: t({
			en: "Existing Draft",
			es: "Borrador existente",
		}),
		createdBy: t({
			en: "Created by",
			es: "Creado por",
		}),
		lastUpdated: t({
			en: "Last updated",
			es: "Última actualización",
		}),
		joinCollaboration: t({
			en: "Join Collaboration",
			es: "Unirse a la colaboración",
		}),
		cancel: t({
			en: "Cancel",
			es: "Cancelar",
		}),
	},
} satisfies Dictionary;

export default draftConflictDialogContent;

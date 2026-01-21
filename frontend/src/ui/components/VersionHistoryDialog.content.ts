import { type Dictionary, t } from "intlayer";

const versionHistoryDialogContent = {
	key: "version-history-dialog",
	content: {
		title: t({
			en: "Version History",
			es: "Historial de versiones",
		}),
		loading: t({
			en: "Loading...",
			es: "Cargando...",
		}),
		restoring: t({
			en: "Restoring...",
			es: "Restaurando...",
		}),
		confirmRestoreTitle: t({
			en: "Confirm Restore",
			es: "Confirmar restauración",
		}),
		confirmRestoreMessage: t({
			en: "Are you sure you want to restore this version? This will create a new version based on the historical content.",
			es: "¿Está seguro de que desea restaurar esta versión? Esto creará una nueva versión basada en el contenido histórico.",
		}),
		confirmRestoreCancel: t({
			en: "Cancel",
			es: "Cancelar",
		}),
		confirmRestoreConfirm: t({
			en: "Confirm",
			es: "Confirmar",
		}),
		restoreSuccess: t({
			en: "Version restored successfully",
			es: "Versión restaurada exitosamente",
		}),
		restoreError: t({
			en: "Failed to restore version",
			es: "Error al restaurar la versión",
		}),
		currentVersion: t({
			en: "Current",
			es: "Actual",
		}),
	},
} satisfies Dictionary;

export default versionHistoryDialogContent;

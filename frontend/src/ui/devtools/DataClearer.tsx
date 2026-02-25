import { useClient } from "../../contexts/ClientContext";
import type { ClearDataType } from "jolli-common";
import { Trash2 } from "lucide-react";
import type { ReactElement } from "react";
import { useState } from "react";
import { useIntlayer } from "react-intlayer";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/AlertDialog";

interface DataTypeConfig {
	type: ClearDataType;
	displayName: string;
	description: string;
	confirmMessage: string;
}

export function DataClearer(): ReactElement {
	const content = useIntlayer("devtools");
	const client = useClient();
	const [clearingData, setClearingData] = useState<Set<ClearDataType>>(new Set());
	const [successMessage, setSuccessMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pendingClear, setPendingClear] = useState<DataTypeConfig | null>(null);

	const dataTypes: Array<DataTypeConfig> = [
		{
			type: "articles",
			displayName: content.dataClearer.clearArticles.value,
			description: content.dataClearer.clearArticlesDesc.value,
			confirmMessage: content.dataClearer.clearArticlesConfirm.value,
		},
		{
			type: "sites",
			displayName: content.dataClearer.clearSites.value,
			description: content.dataClearer.clearSitesDesc.value,
			confirmMessage: content.dataClearer.clearSitesConfirm.value,
		},
		{
			type: "jobs",
			displayName: content.dataClearer.clearJobs.value,
			description: content.dataClearer.clearJobsDesc.value,
			confirmMessage: content.dataClearer.clearJobsConfirm.value,
		},
		{
			type: "github",
			displayName: content.dataClearer.clearGitHub.value,
			description: content.dataClearer.clearGitHubDesc.value,
			confirmMessage: content.dataClearer.clearGitHubConfirm.value,
		},
		{
			type: "sync",
			displayName: content.dataClearer.clearSync.value,
			description: content.dataClearer.clearSyncDesc.value,
			confirmMessage: content.dataClearer.clearSyncConfirm.value,
		},
		{
			type: "spaces",
			displayName: content.dataClearer.clearSpaces.value,
			description: content.dataClearer.clearSpacesDesc.value,
			confirmMessage: content.dataClearer.clearSpacesConfirm.value,
		},
	];

	async function handleClearData(dataTypeConfig: DataTypeConfig): Promise<void> {
		setError(null);
		setSuccessMessage(null);
		setClearingData(prev => new Set(prev).add(dataTypeConfig.type));

		try {
			const result = await client.devTools().clearData(dataTypeConfig.type);
			setSuccessMessage(result.message);
			// Clear success message after 5 seconds
			setTimeout(() => {
				setSuccessMessage(null);
			}, 5000);
		} catch (err) {
			setError(err instanceof Error ? err.message : content.dataClearer.failedToClear.value);
		} finally {
			setClearingData(prev => {
				const next = new Set(prev);
				next.delete(dataTypeConfig.type);
				return next;
			});
		}
	}

	function handleConfirm(): void {
		if (pendingClear) {
			handleClearData(pendingClear);
			setPendingClear(null);
		}
	}

	return (
		<div className="bg-card rounded-lg p-6 border">
			<div className="mb-4">
				<h2 className="font-semibold text-lg mb-1">{content.dataClearer.title}</h2>
				<p className="text-sm text-muted-foreground">{content.dataClearer.subtitle}</p>
			</div>

			{error ? (
				<div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-800 dark:text-red-200">
					{error}
				</div>
			) : null}

			{successMessage ? (
				<div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-sm text-green-800 dark:text-green-200">
					{successMessage}
				</div>
			) : null}

			<div className="space-y-3">
				{dataTypes.map(dataTypeConfig => (
					<div key={dataTypeConfig.type} className="p-3 bg-muted/50 rounded-lg">
						<div className="flex items-center justify-between">
							<div className="flex-1 min-w-0 mr-4">
								<div className="font-medium text-sm">{dataTypeConfig.displayName}</div>
								<div className="text-xs text-muted-foreground mt-0.5">{dataTypeConfig.description}</div>
							</div>
							<button
								type="button"
								onClick={() => setPendingClear(dataTypeConfig)}
								disabled={clearingData.has(dataTypeConfig.type)}
								className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
							>
								<Trash2 className="w-4 h-4" />
								{clearingData.has(dataTypeConfig.type)
									? content.dataClearer.clearing
									: content.dataClearer.clear}
							</button>
						</div>
					</div>
				))}
			</div>

			<div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-sm text-yellow-800 dark:text-yellow-200">
				<strong>{content.dataClearer.warningLabel}</strong> {content.dataClearer.warningMessage}
			</div>

			<AlertDialog
				open={pendingClear !== null}
				onOpenChange={open => {
					if (!open) {
						setPendingClear(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{content.dataClearer.confirmTitle}</AlertDialogTitle>
						<AlertDialogDescription>{pendingClear?.confirmMessage}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{content.dataClearer.cancel}</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={handleConfirm}
						>
							{pendingClear?.displayName}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

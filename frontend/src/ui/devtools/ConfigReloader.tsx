import { useClient } from "../../contexts/ClientContext";
import { RefreshCw } from "lucide-react";
import type { ReactElement } from "react";
import { useState } from "react";
import { useIntlayer } from "react-intlayer";

export function ConfigReloader(): ReactElement {
	const content = useIntlayer("devtools");
	const client = useClient();
	const [isReloading, setIsReloading] = useState(false);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	async function handleReloadConfig(): Promise<void> {
		setError(null);
		setSuccessMessage(null);
		setIsReloading(true);

		try {
			const result = await client.devTools().reloadConfig();
			setSuccessMessage(result.message);
			// Clear success message after 5 seconds
			setTimeout(() => {
				setSuccessMessage(null);
			}, 5000);
		} catch (err) {
			setError(err instanceof Error ? err.message : content.configReloader.failedToReload.value);
		} finally {
			setIsReloading(false);
		}
	}

	return (
		<div className="bg-card rounded-lg p-6 border">
			<div className="mb-4">
				<h2 className="font-semibold text-lg mb-1">{content.configReloader.title}</h2>
				<p className="text-sm text-muted-foreground">{content.configReloader.subtitle}</p>
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
				<button
					type="button"
					onClick={handleReloadConfig}
					disabled={isReloading}
					className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
				>
					<RefreshCw className={`w-4 h-4 ${isReloading ? "animate-spin" : ""}`} />
					{isReloading ? content.configReloader.reloading : content.configReloader.reloadButton}
				</button>
			</div>

			<div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-800 dark:text-blue-200">
				<strong>{content.configReloader.tipLabel}</strong> {content.configReloader.tipMessage}
			</div>
		</div>
	);
}

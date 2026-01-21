import { AlertCircle } from "lucide-react";
import type { ReactElement } from "react";

export interface ErrorAlertProps {
	message: string;
}

export function ErrorAlert({ message }: ErrorAlertProps): ReactElement {
	return (
		<div className="mb-6 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-4">
			<div className="flex items-center gap-2">
				<AlertCircle className="h-5 w-5 text-red-600 dark:text-red-500" />
				<p className="text-sm text-red-800 dark:text-red-200">{message}</p>
			</div>
		</div>
	);
}

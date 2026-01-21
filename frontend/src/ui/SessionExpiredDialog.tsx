import { Button } from "../components/ui/Button";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export interface SessionExpiredDialogProps {
	isOpen: boolean;
	onReLogin: () => void;
}

export function SessionExpiredDialog({ isOpen, onReLogin }: SessionExpiredDialogProps): ReactElement | null {
	const content = useIntlayer("session-expired");

	if (!isOpen) {
		return null;
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			onClick={e => {
				// Allow clicking backdrop to trigger re-login
				if (e.target === e.currentTarget) {
					onReLogin();
				}
			}}
			data-testid="session-expired-dialog"
		>
			<div className="bg-card rounded-lg border shadow-lg w-full max-w-md m-4 p-6">
				<h2 className="text-xl font-semibold mb-4" data-testid="session-expired-title">
					{content.title}
				</h2>
				<p className="text-muted-foreground mb-6" data-testid="session-expired-message">
					{content.message}
				</p>
				<Button onClick={onReLogin} className="w-full" data-testid="session-expired-login-button">
					{content.loginButton}
				</Button>
			</div>
		</div>
	);
}

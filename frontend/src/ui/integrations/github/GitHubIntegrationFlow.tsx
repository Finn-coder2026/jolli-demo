import { useClient } from "../../../contexts/ClientContext";
import { useRedirect } from "../../../contexts/RouterContext";
import type { BaseIntegrationFlowProps } from "../types";
import type { AvailableGitHubInstallation } from "jolli-common";
import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

type FlowState = "loading" | "selecting" | "connecting" | "redirecting" | "waiting_for_install" | "error";

/** Polling interval for checking if installation completed in a new window (ms) */
const INSTALL_POLL_INTERVAL = 3000;

export function GitHubIntegrationFlow({
	onComplete,
	onCancel,
	openInNewWindow,
}: BaseIntegrationFlowProps): ReactElement {
	const content = useIntlayer("github-integration-flow");
	const redirect = useRedirect();
	const client = useClient();
	const [error, setError] = useState<string | undefined>();
	const [flowState, setFlowState] = useState<FlowState>("loading");
	const [availableInstallations, setAvailableInstallations] = useState<Array<AvailableGitHubInstallation>>([]);
	const popupRef = useRef<Window | null>(null);
	const initialInstallCountRef = useRef<number>(0);

	/** Cancel handler — falls back to onComplete when onCancel is not provided. */
	const handleCancel = useCallback(() => {
		(onCancel ?? onComplete)();
	}, [onCancel, onComplete]);

	/**
	 * Open a URL — either in a new window or via redirect, depending on the prop.
	 * Returns true if opened in a new window.
	 */
	const openUrl = useCallback(
		(url: string): boolean => {
			if (openInNewWindow) {
				popupRef.current = window.open(url, "_blank");
				return true;
			}
			redirect(url);
			return false;
		},
		[openInNewWindow, redirect],
	);

	useEffect(() => {
		// First check if there are available installations to connect
		async function checkAvailableInstallations() {
			setFlowState("loading");
			setError(undefined);

			try {
				// Try to list available installations
				const response = await client.github().listAvailableInstallations();
				const notConnected = response.installations.filter(i => !i.alreadyConnectedToCurrentOrg);

				// Remember the current count so we can detect new installations
				initialInstallCountRef.current = response.installations.length;

				if (notConnected.length > 0) {
					// There are installations available to connect - show selection UI
					setAvailableInstallations(notConnected);
					setFlowState("selecting");
				} else {
					// No available installations - redirect to GitHub to install
					await redirectToGitHub();
				}
			} catch {
				// If listing fails, fall back to the normal redirect flow
				await redirectToGitHub();
			}
		}

		async function redirectToGitHub() {
			setFlowState("redirecting");

			try {
				const response = await client.github().setupGitHubRedirect();

				if (response.error) {
					setError(response.error);
					setFlowState("error");
					return;
				}

				if (response.redirectUrl) {
					const openedInNewWindow = openUrl(response.redirectUrl);
					if (openedInNewWindow) {
						setFlowState("waiting_for_install");
					}
				} else {
					setError(content.failedInstallationUrl.value);
					setFlowState("error");
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : content.failedSetup.value);
				setFlowState("error");
			}
		}

		checkAvailableInstallations().then();
	}, [client, openUrl, content.failedInstallationUrl.value, content.failedSetup.value]);

	// Poll for new installations while waiting for the new-window install to complete
	useEffect(() => {
		if (flowState !== "waiting_for_install") {
			return;
		}

		const interval = setInterval(async () => {
			try {
				const response = await client.github().listAvailableInstallations();
				// Detect a new installation by comparing count
				if (response.installations.length > initialInstallCountRef.current) {
					clearInterval(interval);
					// Close the popup if it's still open
					if (popupRef.current && !popupRef.current.closed) {
						popupRef.current.close();
					}
					onComplete();
				}
			} catch {
				// Silently ignore polling errors
			}
		}, INSTALL_POLL_INTERVAL);

		return () => clearInterval(interval);
	}, [flowState, client, onComplete]);

	async function handleConnectExisting(installation: AvailableGitHubInstallation) {
		setFlowState("connecting");
		setError(undefined);

		try {
			const response = await client.github().connectExistingInstallation(installation.installationId);

			if (response.success) {
				if (openInNewWindow) {
					// During onboarding: the API call already created the integration,
					// no need to open a new tab to the integrations page.
					onComplete();
				} else if (response.redirectUrl) {
					// Normal flow: redirect to the integrations page to see the result.
					openUrl(response.redirectUrl);
				} else {
					setError(content.failedSetup.value);
					setFlowState("error");
				}
			} else {
				setError(
					response.error === "installation_not_available"
						? content.installationNotAvailable.value
						: response.error || content.failedSetup.value,
				);
				setFlowState("error");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : content.failedSetup.value);
			setFlowState("error");
		}
	}

	async function handleInstallNew() {
		setFlowState("redirecting");
		setError(undefined);

		try {
			const response = await client.github().setupGitHubRedirect();

			if (response.error) {
				setError(response.error);
				setFlowState("error");
				return;
			}

			if (response.redirectUrl) {
				const openedInNewWindow = openUrl(response.redirectUrl);
				if (openedInNewWindow) {
					setFlowState("waiting_for_install");
				}
			} else {
				setError(content.failedInstallationUrl.value);
				setFlowState("error");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : content.failedSetup.value);
			setFlowState("error");
		}
	}

	// Loading state
	if (flowState === "loading") {
		return (
			<div className="flex flex-col items-center justify-center min-h-[400px]">
				<div className="text-muted-foreground">{content.loading}</div>
			</div>
		);
	}

	// Selecting from available installations
	if (flowState === "selecting") {
		return (
			<div className="flex flex-col items-center justify-center min-h-[400px] p-6">
				<h3 className="text-lg font-semibold mb-4">{content.selectInstallation}</h3>
				<p className="text-muted-foreground mb-6 text-center max-w-md">{content.selectInstallationDesc}</p>

				<div className="space-y-3 w-full max-w-md mb-6">
					{availableInstallations.map(installation => (
						<button
							key={installation.installationId}
							type="button"
							onClick={() => handleConnectExisting(installation)}
							className="w-full p-4 border rounded-lg hover:bg-accent text-left flex items-center justify-between"
						>
							<div>
								<div className="font-medium">{installation.accountLogin}</div>
								<div className="text-sm text-muted-foreground">
									{installation.accountType === "Organization" ? content.organization : content.user}{" "}
									• {installation.repos.length} {content.repositories}
								</div>
							</div>
							<span className="text-primary">{content.connect}</span>
						</button>
					))}
				</div>

				<div className="border-t pt-4 w-full max-w-md">
					<button
						type="button"
						onClick={handleInstallNew}
						className="w-full p-3 text-center text-muted-foreground hover:text-foreground"
					>
						{content.installNewOrganization}
					</button>
				</div>

				<button
					type="button"
					onClick={handleCancel}
					className="mt-4 text-sm text-muted-foreground hover:text-foreground"
				>
					{content.goBack}
				</button>
			</div>
		);
	}

	// Connecting to existing installation
	if (flowState === "connecting") {
		return (
			<div className="flex flex-col items-center justify-center min-h-[400px]">
				<div className="text-muted-foreground">{content.connecting}</div>
			</div>
		);
	}

	// Redirecting to GitHub
	if (flowState === "redirecting") {
		return (
			<div className="flex flex-col items-center justify-center min-h-[400px]">
				<div className="text-muted-foreground">{content.redirecting}</div>
			</div>
		);
	}

	// Waiting for installation to complete in the new window
	if (flowState === "waiting_for_install") {
		return (
			<div className="flex flex-col items-center justify-center min-h-[400px] p-6">
				<div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
				<p className="text-muted-foreground text-center mb-2">{content.waitingForInstall}</p>
				<p className="text-sm text-muted-foreground text-center mb-6">{content.waitingForInstallHint}</p>
				<button
					type="button"
					onClick={handleCancel}
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					{content.goBack}
				</button>
			</div>
		);
	}

	// Error state
	return (
		<div className="flex flex-col items-center justify-center min-h-[400px]">
			<div className="text-center">
				<p className="text-destructive mb-4">{error}</p>
				<button
					type="button"
					onClick={handleCancel}
					className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
				>
					{content.goBack}
				</button>
			</div>
		</div>
	);
}

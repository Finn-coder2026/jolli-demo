import { useClient } from "../../../contexts/ClientContext";
import { useRedirect } from "../../../contexts/RouterContext";
import type { BaseIntegrationFlowProps } from "../types";
import type { AvailableGitHubInstallation } from "jolli-common";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

type FlowState = "loading" | "selecting" | "connecting" | "redirecting" | "error";

export function GitHubIntegrationFlow({ onComplete }: BaseIntegrationFlowProps): ReactElement {
	const content = useIntlayer("github-integration-flow");
	const redirect = useRedirect();
	const client = useClient();
	const [error, setError] = useState<string | undefined>();
	const [flowState, setFlowState] = useState<FlowState>("loading");
	const [availableInstallations, setAvailableInstallations] = useState<Array<AvailableGitHubInstallation>>([]);

	useEffect(() => {
		// First check if there are available installations to connect
		async function checkAvailableInstallations() {
			setFlowState("loading");
			setError(undefined);

			try {
				// Try to list available installations
				const response = await client.github().listAvailableInstallations();
				const notConnected = response.installations.filter(i => !i.alreadyConnectedToCurrentOrg);

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
					redirect(response.redirectUrl);
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
	}, [client, redirect]);

	async function handleConnectExisting(installation: AvailableGitHubInstallation) {
		setFlowState("connecting");
		setError(undefined);

		try {
			const response = await client.github().connectExistingInstallation(installation.installationId);

			if (response.success && response.redirectUrl) {
				redirect(response.redirectUrl);
			} else {
				setError(response.error || content.failedSetup.value);
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
				redirect(response.redirectUrl);
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
					onClick={() => onComplete()}
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

	// Error state
	return (
		<div className="flex flex-col items-center justify-center min-h-[400px]">
			<div className="text-center">
				<p className="text-destructive mb-4">{error}</p>
				<button
					type="button"
					onClick={() => onComplete()}
					className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
				>
					{content.goBack}
				</button>
			</div>
		</div>
	);
}

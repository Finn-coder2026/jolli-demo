import { Badge } from "../../../components/ui/Badge";
import { Breadcrumb, type BreadcrumbItem } from "../../../components/ui/Breadcrumb";
import { Button } from "../../../components/ui/Button";
import { useClient } from "../../../contexts/ClientContext";
import { useNavigation } from "../../../contexts/NavigationContext";
import { useRedirect } from "../../../contexts/RouterContext";
import type { AvailableGitHubInstallation, GitHubInstallation } from "jolli-common";
import { AlertCircle, Building2, CheckCircle, ChevronRight, ExternalLink, Plus, Trash2, User, X } from "lucide-react";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { useIntlayer } from "react-intlayer";

export interface GitHubOrgUserListProps {
	appId?: string;
}

export function GitHubOrgUserList({ appId }: GitHubOrgUserListProps): ReactElement {
	const content = useIntlayer("github-org-user-list");
	const flowContent = useIntlayer("github-integration-flow");
	const client = useClient();
	const { navigate } = useNavigation();
	const redirect = useRedirect();
	const [installations, setInstallations] = useState<Array<GitHubInstallation>>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | undefined>();
	const [isInstalling, setIsInstalling] = useState(false);
	const [availableInstallations, setAvailableInstallations] = useState<Array<AvailableGitHubInstallation>>([]);
	const [showAvailablePanel, setShowAvailablePanel] = useState(false);
	const [isConnecting, setIsConnecting] = useState(false);
	const [showRemoveModal, setShowRemoveModal] = useState(false);
	const [selectedInstallation, setSelectedInstallation] = useState<GitHubInstallation | null>(null);
	const [isRemoving, setIsRemoving] = useState(false);
	const [removedInstallation, setRemovedInstallation] = useState<GitHubInstallation | null>(null);

	useEffect(() => {
		loadData().then();
	}, [appId]);

	// Check for removal params from navigation (when removing from org/user detail page)
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const removedName = params.get("removed");
		const removedType = params.get("removed_type");
		const installationIdStr = params.get("installation_id");

		if (removedName && removedType && installationIdStr) {
			// Create installation object for banner display
			// Only name, containerType, and installationId are used by getGitHubInstallationsUrl
			setRemovedInstallation({
				id: 0,
				installationId: Number.parseInt(installationIdStr, 10),
				name: removedName,
				containerType: removedType as "org" | "user",
				appSlug: "",
				githubAppId: 0,
				totalRepos: 0,
				enabledRepos: 0,
				needsAttention: 0,
				appName: "",
			});

			// Clean the URL
			window.history.replaceState({}, "", "/integrations/github");
		}
	}, []);

	async function loadData() {
		setLoading(true);
		setError(undefined);
		try {
			// Load installations
			const numericAppId = appId ? Number.parseInt(appId) : undefined;
			const data = await client.github().getGitHubInstallations(numericAppId);
			setInstallations(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : content.failedLoadInstallations.value);
		} finally {
			setLoading(false);
		}
	}

	async function handleInstallApp() {
		setIsInstalling(true);
		setError(undefined);
		try {
			// First check if there are available installations to connect
			// This prevents users from going to GitHub for already-installed apps
			const availableResponse = await client.github().listAvailableInstallations();
			const notConnected = availableResponse.installations.filter(i => !i.alreadyConnectedToCurrentOrg);

			if (notConnected.length > 0) {
				// Show selection panel instead of redirecting to GitHub
				setAvailableInstallations(notConnected);
				setShowAvailablePanel(true);
				setIsInstalling(false);
				return;
			}

			// No existing installations available - redirect to GitHub
			await redirectToGitHub();
		} catch {
			// If listing fails, fall back to direct redirect (existing behavior)
			await redirectToGitHub();
		}
	}

	async function redirectToGitHub() {
		try {
			// Call the setup redirect to install the Jolli GitHub App
			const response = await client.github().setupGitHubRedirect();

			if (response.error) {
				setError(response.error);
				setIsInstalling(false);
				return;
			}

			// Redirect to GitHub to install the app
			if (response.redirectUrl) {
				redirect(response.redirectUrl);
			} else {
				setError(flowContent.failedInstallationUrl.value);
				setIsInstalling(false);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : content.failedStartInstallation.value);
			setIsInstalling(false);
		}
	}

	async function handleConnectExisting(installation: AvailableGitHubInstallation) {
		setIsConnecting(true);
		setError(undefined);
		try {
			const response = await client.github().connectExistingInstallation(installation.installationId);

			if (response.success && response.redirectUrl) {
				redirect(response.redirectUrl);
			} else {
				setError(response.error || flowContent.failedSetup.value);
				setIsConnecting(false);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : flowContent.failedSetup.value);
			setIsConnecting(false);
		}
	}

	function handleInstallNew() {
		setShowAvailablePanel(false);
		setIsInstalling(true);
		redirectToGitHub().then();
	}

	function handleCloseAvailablePanel() {
		setShowAvailablePanel(false);
		setAvailableInstallations([]);
	}

	function handleRemoveClick(e: React.MouseEvent, installation: GitHubInstallation) {
		e.stopPropagation();
		setSelectedInstallation(installation);
		setShowRemoveModal(true);
	}

	function handleRemoveCancel() {
		setShowRemoveModal(false);
		setSelectedInstallation(null);
	}

	async function handleRemoveConfirm() {
		if (!selectedInstallation) {
			return;
		}

		setIsRemoving(true);
		setError(undefined);
		try {
			await client.github().deleteGitHubInstallation(selectedInstallation.id);
			// Remove from local state
			setInstallations(prev => prev.filter(i => i.id !== selectedInstallation.id));
			// Store for success banner
			setRemovedInstallation(selectedInstallation);
			// Close modal
			setShowRemoveModal(false);
			setSelectedInstallation(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : content.failedRemoveInstallation.value);
			setShowRemoveModal(false);
			setSelectedInstallation(null);
		} finally {
			setIsRemoving(false);
		}
	}

	function handleDismissSuccessBanner() {
		setRemovedInstallation(null);
	}

	function getGitHubInstallationsUrl(installation: GitHubInstallation): string {
		if (installation.containerType === "org") {
			return `https://github.com/organizations/${installation.name}/settings/installations/${installation.installationId}`;
		}
		return `https://github.com/settings/installations/${installation.installationId}`;
	}

	const orgs = useMemo(() => installations.filter(i => i.containerType === "org"), [installations]);
	const users = useMemo(() => installations.filter(i => i.containerType === "user"), [installations]);

	const breadcrumbItems: Array<BreadcrumbItem> = useMemo(() => {
		const items: Array<BreadcrumbItem> = [
			{ label: content.breadcrumbs.integrations.value, path: "/integrations" },
			{ label: content.breadcrumbs.github.value },
		];
		return items;
	}, [content]);

	const buildNavPath = (installation: GitHubInstallation): string => {
		const containerPath = installation.containerType === "org" ? "org" : "user";
		return `/integrations/github/${containerPath}/${encodeURIComponent(installation.name)}`;
	};

	const renderInstallationCard = (installation: GitHubInstallation) => {
		const isOrg = installation.containerType === "org";
		const Icon = isOrg ? Building2 : User;

		return (
			<div
				key={installation.installationId}
				className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
				onClick={() => navigate(buildNavPath(installation))}
				onKeyDown={e => {
					if (e.key === "Enter" || e.key === " ") {
						navigate(buildNavPath(installation));
					}
				}}
				role="button"
				tabIndex={0}
			>
				<div className="flex items-center gap-4 flex-1">
					<div className="rounded-full bg-primary/10 p-2">
						<Icon className="h-5 w-5 text-primary" />
					</div>
					<div className="flex-1">
						<div className="flex items-center gap-2">
							<h3 className="font-semibold">{installation.name}</h3>
							{(installation.needsAttention > 0 ||
								installation.installationStatus === "not_installed") && (
								<Badge variant="destructive" className="gap-1">
									<AlertCircle className="h-3 w-3" />
									{content.needsAttention}
								</Badge>
							)}
						</div>
						<p className="text-sm text-muted-foreground mt-1">
							{installation.enabledRepos} of {installation.totalRepos}{" "}
							{installation.totalRepos === 1 ? content.repository : content.repositories}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={e => handleRemoveClick(e, installation)}
						onKeyDown={e => e.stopPropagation()}
						className="p-2 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
						aria-label={content.removeButton.value}
						title={content.removeButton.value}
						data-testid={`remove-installation-${installation.id}`}
					>
						<Trash2 className="h-4 w-4" />
					</button>
					<ChevronRight className="h-5 w-5 text-muted-foreground" />
				</div>
			</div>
		);
	};

	return (
		<div className="bg-card rounded-lg p-5 border h-full flex flex-col overflow-hidden">
			<Breadcrumb items={breadcrumbItems} onNavigate={navigate} />

			<div className="mb-6 flex items-start justify-between">
				<div>
					<h1 className="font-semibold" style={{ fontSize: "2rem", margin: "0 0 8px" }}>
						{content.title}
					</h1>
					<p className="text-sm m-0" style={{ color: "#808080cc" }}>
						{content.subtitle}
					</p>
				</div>
				<Button onClick={handleInstallApp} disabled={isInstalling} className="shrink-0">
					<Plus className="h-4 w-4 mr-2" />
					{isInstalling ? content.installing : content.installGitHubApp}
				</Button>
			</div>

			{error && (
				<div className="mb-4 rounded-md bg-destructive/10 border border-destructive/20 p-3">
					<p className="text-sm text-destructive">{error}</p>
				</div>
			)}

			{/* Success banner - shown after removing an installation */}
			{removedInstallation && (
				<div
					className="mb-4 rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-4"
					data-testid="remove-success-banner"
				>
					<div className="flex items-start gap-3">
						<CheckCircle className="h-5 w-5 text-green-600 dark:text-green-500 flex-shrink-0 mt-0.5" />
						<div className="flex-1">
							<h3 className="font-semibold text-green-800 dark:text-green-200">
								{content.removeSuccess.title}
							</h3>
							<p className="text-sm text-green-700 dark:text-green-300 mt-1">
								<span className="font-medium">{removedInstallation.name}</span>{" "}
								{content.removeSuccess.message}
							</p>
							<a
								href={getGitHubInstallationsUrl(removedInstallation)}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 mt-3 text-sm text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-green-100 underline"
								data-testid="github-uninstall-link"
							>
								<ExternalLink className="h-4 w-4" />
								{content.removeSuccess.uninstallFromGitHub}
							</a>
						</div>
						<button
							type="button"
							onClick={handleDismissSuccessBanner}
							className="p-1 hover:bg-green-200 dark:hover:bg-green-800 rounded"
							aria-label="Close"
							data-testid="dismiss-success-banner"
						>
							<X className="h-4 w-4 text-green-600 dark:text-green-500" />
						</button>
					</div>
				</div>
			)}

			{/* Available installations panel - shown when user clicks Install and there are existing installations */}
			{showAvailablePanel && (
				<div className="mb-6 rounded-lg border bg-accent/30 p-6">
					<div className="flex items-start justify-between mb-4">
						<div>
							<h3 className="text-lg font-semibold">{flowContent.selectInstallation}</h3>
							<p className="text-sm text-muted-foreground mt-1">{flowContent.selectInstallationDesc}</p>
						</div>
						<button
							type="button"
							onClick={handleCloseAvailablePanel}
							className="p-1 hover:bg-accent rounded"
							aria-label="Close"
						>
							<X className="h-5 w-5 text-muted-foreground" />
						</button>
					</div>

					{isConnecting ? (
						<div className="text-center py-8">
							<p className="text-muted-foreground">{flowContent.connecting}</p>
						</div>
					) : (
						<>
							<div className="space-y-3 mb-4">
								{availableInstallations.map(installation => (
									<button
										key={installation.installationId}
										type="button"
										onClick={() => handleConnectExisting(installation)}
										className="w-full p-4 border rounded-lg hover:bg-accent text-left flex items-center justify-between bg-background"
									>
										<div>
											<div className="font-medium">{installation.accountLogin}</div>
											<div className="text-sm text-muted-foreground">
												{installation.accountType === "Organization"
													? flowContent.organization
													: flowContent.user}{" "}
												• {installation.repos.length} {flowContent.repositories}
											</div>
										</div>
										<span className="text-primary">{flowContent.connect}</span>
									</button>
								))}
							</div>

							<div className="border-t pt-4">
								<button
									type="button"
									onClick={handleInstallNew}
									className="w-full p-3 text-center text-muted-foreground hover:text-foreground"
								>
									{flowContent.installNewOrganization}
								</button>
							</div>
						</>
					)}
				</div>
			)}

			{loading ? (
				<div className="text-center py-12">
					<p className="text-muted-foreground">{content.loadingInstallations}</p>
				</div>
			) : installations.length === 0 ? (
				<div className="text-center py-12">
					<Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
					<p className="text-muted-foreground mb-4">{content.noInstallationsFound}</p>
					<p className="text-sm text-muted-foreground mb-4">{content.installToGetStarted}</p>
					<Button onClick={handleInstallApp} disabled={isInstalling}>
						<Plus className="h-4 w-4 mr-2" />
						{isInstalling ? content.installing : content.installGitHubApp}
					</Button>
				</div>
			) : (
				<div className="flex-1 overflow-auto min-h-0 space-y-8">
					{orgs.length > 0 && (
						<div>
							<h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
								<Building2 className="h-5 w-5" />
								{content.organizations}
							</h2>
							<div className="space-y-3">{orgs.map(renderInstallationCard)}</div>
						</div>
					)}

					{users.length > 0 && (
						<div>
							<h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
								<User className="h-5 w-5" />
								{content.users}
							</h2>
							<div className="space-y-3">{users.map(renderInstallationCard)}</div>
						</div>
					)}
				</div>
			)}

			{/* Remove confirmation modal */}
			{showRemoveModal && selectedInstallation && (
				<div
					className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
					data-testid="remove-modal-backdrop"
				>
					<div className="bg-card border rounded-lg p-6 max-w-md w-full mx-4" data-testid="remove-modal">
						<h2 className="text-xl font-semibold mb-2">
							{selectedInstallation.containerType === "org"
								? content.removeModal.titleOrg
								: content.removeModal.titleUser}
						</h2>
						<p className="text-muted-foreground mb-4">
							Are you sure you want to remove{" "}
							<span className="font-medium">{selectedInstallation.name}</span>?
						</p>
						<p className="text-sm text-muted-foreground mb-6">{content.removeModal.warningMessage}</p>
						<div className="flex gap-3 justify-end">
							<Button
								variant="outline"
								onClick={handleRemoveCancel}
								disabled={isRemoving}
								data-testid="remove-modal-cancel"
							>
								{content.removeModal.cancel}
							</Button>
							<Button
								variant="destructive"
								onClick={handleRemoveConfirm}
								disabled={isRemoving}
								data-testid="remove-modal-confirm"
							>
								{isRemoving ? content.removeModal.removing : content.removeModal.confirm}
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

import { Button } from "../../components/ui/Button";
import { useClient } from "../../contexts/ClientContext";
import { useNavigation } from "../../contexts/NavigationContext";
import { IntegrationCard } from "./components/IntegrationCard";
import { GitHubOrgUserList } from "./github/GitHubOrgUserList";
import { GitHubRepoList } from "./github/GitHubRepoList";
import { IntegrationSetup } from "./IntegrationSetup";
import { StaticFileManage } from "./staticfile/StaticFileManage";
import type { GitHubSummaryResponse, Integration, StaticFileIntegrationMetadata } from "jolli-common";
import { FileUp, FolderGit2, Plus } from "lucide-react";
import { type ReactElement, useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

export function Integrations(): ReactElement {
	const { integrationView, integrationContainer, integrationContainerType, navigate } = useNavigation();
	const client = useClient();
	const content = useIntlayer("integrations");
	const [githubSummary, setGithubSummary] = useState<GitHubSummaryResponse | undefined>();
	const [staticFileIntegrations, setStaticFileIntegrations] = useState<Array<Integration>>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | undefined>();
	const [showSetup, setShowSetup] = useState(false);

	useEffect(() => {
		if (integrationView === "main") {
			loadSummary().then();
		}
	}, [integrationView]);

	async function loadSummary() {
		setLoading(true);
		setError(undefined);
		try {
			const [githubData, integrations] = await Promise.all([
				client.github().getGitHubSummary(),
				client.integrations().listIntegrations(),
			]);
			setGithubSummary(githubData);
			setStaticFileIntegrations(integrations.filter(i => i.type === "static_file"));
		} catch (err) {
			const errorFallback = content.errorFallback.value;
			setError(err instanceof Error ? err.message : errorFallback);
		} finally {
			setLoading(false);
		}
	}

	async function handleDeleteIntegration(integration: Integration) {
		const confirmMessage = content.confirmDeleteIntegration({ name: integration.name }).value;
		if (!window.confirm(confirmMessage)) {
			return;
		}
		try {
			await client.integrations().deleteIntegration(integration.id);
			// Reload the list after deletion
			await loadSummary();
		} catch (err) {
			const errorFallback = content.errorFallback.value;
			setError(err instanceof Error ? err.message : errorFallback);
		}
	}

	function handleAddIntegration() {
		setShowSetup(true);
	}

	function handleSetupComplete() {
		setShowSetup(false);
		// Reload summary to show the newly connected integration
		loadSummary().then();
	}

	// If showing wizard, render it as an overlay
	if (showSetup) {
		return <IntegrationSetup onComplete={handleSetupComplete} />;
	}

	// Route to specific integration views - these should never show the setup wizard
	// as they're for managing existing installations
	if (integrationView === "github") {
		// /integrations/github - show orgs and users
		return <GitHubOrgUserList />;
	}

	if (integrationView === "github-org-repos" && integrationContainer && integrationContainerType === "org") {
		// /integrations/github/org/:name - show repos for this org
		// Don't check for empty repos here - let GitHubRepoList handle its own empty state
		return <GitHubRepoList containerName={integrationContainer} containerType="org" />;
	}

	if (integrationView === "github-user-repos" && integrationContainer && integrationContainerType === "user") {
		// /integrations/github/user/:name - show repos for this user
		// Don't check for empty repos here - let GitHubRepoList handle its own empty state
		return <GitHubRepoList containerName={integrationContainer} containerType="user" />;
	}

	if (integrationView === "static-file") {
		// /integrations/static-file/:id - manage static file integration
		return <StaticFileManage />;
	}

	// Main integrations view with cards - only show setup wizard here if no repos exist
	return (
		<div className="bg-card rounded-lg p-5 border h-full">
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="font-semibold" style={{ fontSize: "2rem", margin: "0 0 8px" }}>
						{content.title}
					</h1>
					<p className="text-sm m-0" style={{ color: "#808080cc" }}>
						{content.subtitle}
					</p>
				</div>
				<Button onClick={handleAddIntegration}>
					<Plus className="h-4 w-4 mr-2" />
					{content.addIntegration}
				</Button>
			</div>

			{error && (
				<div className="mb-4 rounded-md bg-destructive/10 border border-destructive/20 p-3">
					<p className="text-sm text-destructive">{error}</p>
				</div>
			)}

			{loading ? (
				<div className="text-center py-12">
					<p className="text-muted-foreground">{content.loading}</p>
				</div>
			) : !githubSummary ||
				(githubSummary.orgCount === 0 &&
					githubSummary.totalRepos === 0 &&
					staticFileIntegrations.length === 0) ? (
				<div className="text-center py-12">
					<FolderGit2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
					<p className="text-muted-foreground mb-4">{content.noIntegrations}</p>
					<Button onClick={handleAddIntegration}>
						<Plus className="h-4 w-4 mr-2" />
						{content.connectFirstRepo}
					</Button>
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{githubSummary && (githubSummary.orgCount > 0 || githubSummary.totalRepos > 0) && (
						<IntegrationCard
							title={content.githubTitle.value}
							icon={FolderGit2}
							orgCount={githubSummary.orgCount}
							totalRepos={githubSummary.totalRepos}
							enabledRepos={githubSummary.enabledRepos}
							needsAttention={githubSummary.needsAttention}
							lastSync={githubSummary.lastSync}
							onClick={() => navigate("/integrations/github")}
						/>
					)}
					{/* c8 ignore start */}
					{staticFileIntegrations.map(integration => {
						const metadata = integration.metadata as StaticFileIntegrationMetadata | undefined;
						const fileCount = metadata?.fileCount ?? 0;
						const lastUpload = metadata?.lastUpload;
						return (
							<IntegrationCard
								key={integration.id}
								title={integration.name}
								icon={FileUp}
								totalRepos={fileCount}
								enabledRepos={fileCount}
								{...(lastUpload ? { lastSync: lastUpload } : {})}
								onClick={() => navigate(`/integrations/static-file/${integration.id}`)}
								onDelete={() => handleDeleteIntegration(integration)}
							/>
						);
					})}
					{/* c8 ignore stop */}
				</div>
			)}
		</div>
	);
}

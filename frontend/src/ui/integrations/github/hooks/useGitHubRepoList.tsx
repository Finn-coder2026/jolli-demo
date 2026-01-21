import type { BreadcrumbItem } from "../../../../components/ui/Breadcrumb";
import { useClient } from "../../../../contexts/ClientContext";
import { useNavigation } from "../../../../contexts/NavigationContext";
import { useOrg } from "../../../../contexts/OrgContext";
import type { GitHubRepository } from "jolli-common";
import { useEffect, useMemo, useState } from "react";

function buildGitHubRepoBreadcrumbs(containerName: string): Array<BreadcrumbItem> {
	return [
		{ label: "Integrations", path: "/integrations" },
		{ label: "GitHub", path: "/integrations/github" },
		{ label: containerName },
	];
}

export interface UseGitHubRepoListParams {
	containerName: string;
	containerType: "org" | "user";
}

export interface UseGitHubRepoListReturn {
	repos: Array<GitHubRepository>;
	loading: boolean;
	error: string | undefined;
	showAllRepos: boolean;
	setShowAllRepos: (show: boolean) => void;
	handleShowAllRepos: () => void;
	handleShowEnabledOnly: () => void;
	showWelcome: boolean;
	setShowWelcome: (show: boolean) => void;
	installationId: number | undefined;
	appSlug: string | undefined;
	installationStatus: "active" | "not_installed";
	showDeleteContainerModal: boolean;
	setShowDeleteContainerModal: (show: boolean) => void;
	deletingContainer: boolean;
	containerId: number | undefined;
	loadRepos: () => Promise<void>;
	handleToggleSuccess: (repo: GitHubRepository, newState: boolean) => void;
	handleToggleError: (errorMessage: string) => void;
	confirmDeleteContainer: () => Promise<void>;
	filteredRepos: Array<GitHubRepository>;
	enabledCount: number;
	shouldShowWelcome: boolean;
	shouldShowFilterButtons: boolean;
	breadcrumbItems: Array<BreadcrumbItem>;
	navigate: (path: string) => void;
	fadingOutRepos: Set<string>;
	searchQuery: string;
	setSearchQuery: (query: string) => void;
	currentPage: number;
	setCurrentPage: (page: number) => void;
	totalPages: number;
	paginatedRepos: Array<GitHubRepository>;
}

export function useGitHubRepoList({ containerName, containerType }: UseGitHubRepoListParams): UseGitHubRepoListReturn {
	const client = useClient();
	const { navigate } = useNavigation();
	const { org, tenant, isMultiTenant } = useOrg();
	const [repos, setRepos] = useState<Array<GitHubRepository>>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | undefined>();
	const [showAllRepos, setShowAllRepos] = useState(false);
	const [showWelcomeInternal, setShowWelcomeInternal] = useState(true);

	// Generate localStorage key for welcome banner dismissal
	// In multi-tenant mode, include tenant/org slugs so same GitHub org in different Jolli tenants has separate state
	const welcomeDismissedKey = useMemo(() => {
		if (isMultiTenant) {
			return `jolli:github:welcome-dismissed:${tenant?.slug}:${org?.slug}:${containerName}`;
		}
		return `jolli:github:welcome-dismissed:${containerName}`;
	}, [isMultiTenant, tenant?.slug, org?.slug, containerName]);

	// Check localStorage to initialize showWelcome state
	// This runs when key changes (handles initial load and multi-tenant context loading)
	useEffect(() => {
		try {
			const dismissed = localStorage.getItem(welcomeDismissedKey) === "true";
			if (dismissed) {
				setShowWelcomeInternal(false);
			}
		} catch {
			// Ignore localStorage errors
		}
	}, [welcomeDismissedKey]);

	// Wrapper to persist dismissal to localStorage
	function setShowWelcome(show: boolean) {
		setShowWelcomeInternal(show);
		if (!show) {
			try {
				localStorage.setItem(welcomeDismissedKey, "true");
			} catch {
				// Ignore localStorage errors
			}
		}
	}

	const showWelcome = showWelcomeInternal;
	const [installationId, setInstallationId] = useState<number | undefined>();
	const [appSlug, setAppSlug] = useState<string | undefined>();
	const [installationStatus, setInstallationStatus] = useState<"active" | "not_installed">("active");
	const [containerId, setContainerId] = useState<number | undefined>();
	const [showDeleteContainerModal, setShowDeleteContainerModal] = useState(false);
	const [deletingContainer, setDeletingContainer] = useState(false);
	const [initialLoadComplete, setInitialLoadComplete] = useState(false);
	const [recentlyToggledRepos, setRecentlyToggledRepos] = useState<Set<string>>(new Set());
	const [fadingOutRepos, setFadingOutRepos] = useState<Set<string>>(new Set());
	const [searchQuery, setSearchQuery] = useState("");
	const [currentPage, setCurrentPage] = useState(1);

	const ITEMS_PER_PAGE = 20;

	useEffect(() => {
		loadRepos().then();

		// Auto-refresh when window regains focus (e.g., returning from GitHub)
		/* c8 ignore next 6 */
		const handleFocus = () => {
			// Only auto-refresh if app was uninstalled - user might be coming back after reinstalling
			if (installationStatus === "not_installed") {
				loadRepos().then();
			}
		};

		window.addEventListener("focus", handleFocus);
		return () => window.removeEventListener("focus", handleFocus);
	}, [containerName, containerType, installationStatus]);

	// Set default filter only on initial load
	useEffect(() => {
		if (!initialLoadComplete && repos.length > 0) {
			const hasReposNeedingAttention = repos.some(r => r.status === "needs_repo_access");
			const hasEnabledRepos = repos.some(r => r.enabled);

			// Default to "All Repos" if any repos need attention, otherwise show enabled repos if any exist
			setShowAllRepos(hasReposNeedingAttention || !hasEnabledRepos);
			setInitialLoadComplete(true);
		}
	}, [repos, initialLoadComplete]);

	async function syncInstallations() {
		try {
			await client.github().syncGitHubInstallations();
		} catch {
			/* c8 ignore next 1 */
			// Ignore sync errors - we'll still try to load repos
		}
	}

	async function findInstallationData() {
		const installations = await client.github().getGitHubInstallations();
		const installation = installations.find(i => i.name === containerName && i.containerType === containerType);

		if (!installation) {
			const containerLabel = containerType === "org" ? "Organization" : "User";
			setError(`${containerLabel} "${containerName}" not found`);
			setRepos([]);
			setInstallationId(undefined);
			setAppSlug(undefined);
			return null;
		}

		setInstallationId(installation.installationId);
		setContainerId(installation.id);
		setAppSlug(installation.appSlug);

		return installation;
	}

	async function loadRepos() {
		setLoading(true);
		setError(undefined);
		try {
			await syncInstallations();
			const installation = await findInstallationData();

			if (!installation) {
				return;
			}

			const { repos: repoData, installationStatus: status } = await client
				.github()
				.getInstallationRepos(installation.installationId);
			setRepos(repoData);
			setInstallationStatus(status);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load repositories");
		} finally {
			setLoading(false);
		}
	}

	function handleToggleSuccess(repo: GitHubRepository, newState: boolean) {
		// Update the actual repo state for the badge
		setRepos(prev => prev.map(r => (r.fullName === repo.fullName ? { ...r, enabled: newState } : r)));
		setError(undefined);

		// Only apply fade-out effect in "Enabled Only" view
		if (!showAllRepos) {
			// Mark this repo as recently toggled so it stays visible in "Enabled Only" view
			setRecentlyToggledRepos(prev => new Set(prev).add(repo.fullName));

			// If repo was disabled, start fade-out after 1.5 seconds, then remove after 2 seconds
			if (!newState) {
				// Start fading out at 1.5s
				setTimeout(() => {
					setFadingOutRepos(prev => new Set(prev).add(repo.fullName));
				}, 1500);

				// Remove completely at 2s
				setTimeout(() => {
					setRecentlyToggledRepos(prev => {
						const next = new Set(prev);
						next.delete(repo.fullName);
						return next;
					});
					setFadingOutRepos(prev => {
						const next = new Set(prev);
						next.delete(repo.fullName);
						return next;
					});
				}, 2000);
			}
		}
	}

	function handleToggleError(errorMessage: string) {
		setError(errorMessage);
	}

	async function confirmDeleteContainer() {
		/* c8 ignore next 3 */
		if (!containerId) {
			return;
		}

		setDeletingContainer(true);
		setError(undefined);

		try {
			await client.github().deleteGitHubInstallation(containerId);

			// Navigate back to integrations list with removal info for success banner
			const params = new URLSearchParams({
				removed: containerName,
				removed_type: containerType,
				installation_id: String(installationId ?? 0),
			});
			navigate(`/integrations/github?${params.toString()}`);
		} catch (err) {
			/* c8 ignore next 2 */
			setError(err instanceof Error ? err.message : `Failed to delete ${containerType}`);
			setShowDeleteContainerModal(false);
		} finally {
			setDeletingContainer(false);
		}
	}

	// Switch to "All Repos" view when user starts typing in search box
	useEffect(() => {
		if (searchQuery !== "" && !showAllRepos) {
			setShowAllRepos(true);
		}
	}, [searchQuery, showAllRepos]);

	// Reset to page 1 when search query or filter changes
	useEffect(() => {
		setCurrentPage(1);
	}, [searchQuery, showAllRepos]);

	// Wrapper functions to change view and clear search
	function handleShowAllRepos() {
		setShowAllRepos(true);
		setSearchQuery("");
	}

	function handleShowEnabledOnly() {
		setShowAllRepos(false);
		setSearchQuery("");
	}

	// Filter repos based on view, but keep recently toggled repos visible in "Enabled Only" view
	const filteredRepos = showAllRepos ? repos : repos.filter(r => r.enabled || recentlyToggledRepos.has(r.fullName));

	// Apply search filter
	const searchedRepos = useMemo(() => {
		if (searchQuery === "") {
			return filteredRepos;
		}
		const lowercaseQuery = searchQuery.toLowerCase();
		return filteredRepos.filter(repo => repo.fullName.toLowerCase().includes(lowercaseQuery));
	}, [filteredRepos, searchQuery]);

	// Calculate pagination
	const totalPages = Math.ceil(searchedRepos.length / ITEMS_PER_PAGE);
	const paginatedRepos = useMemo(() => {
		const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
		const endIndex = startIndex + ITEMS_PER_PAGE;
		return searchedRepos.slice(startIndex, endIndex);
	}, [searchedRepos, currentPage, ITEMS_PER_PAGE]);

	const enabledCount = repos.filter(r => r.enabled).length;
	const shouldShowWelcome = showWelcome && repos.length > 0 && enabledCount === 0;
	const shouldShowFilterButtons = repos.length > 1 && enabledCount < repos.length;

	const breadcrumbItems: Array<BreadcrumbItem> = useMemo(() => {
		return buildGitHubRepoBreadcrumbs(containerName);
	}, [containerName]);

	return {
		repos,
		loading,
		error,
		showAllRepos,
		setShowAllRepos,
		handleShowAllRepos,
		handleShowEnabledOnly,
		showWelcome,
		setShowWelcome,
		installationId,
		appSlug,
		installationStatus,
		showDeleteContainerModal,
		setShowDeleteContainerModal,
		deletingContainer,
		containerId,
		loadRepos,
		handleToggleSuccess,
		handleToggleError,
		confirmDeleteContainer,
		filteredRepos,
		enabledCount,
		shouldShowWelcome,
		shouldShowFilterButtons,
		breadcrumbItems,
		navigate,
		fadingOutRepos,
		searchQuery,
		setSearchQuery,
		currentPage,
		setCurrentPage,
		totalPages,
		paginatedRepos,
	};
}

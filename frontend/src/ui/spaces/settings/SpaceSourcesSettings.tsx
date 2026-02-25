/**
 * SpaceSourcesSettings - Sources settings page for a Space.
 *
 * Features:
 * - Lists sources currently bound to the space
 * - Add sources from GitHub integrations (auto-creates Source record)
 * - Toggle enabled state per binding
 * - Remove source bindings
 * - Empty state when no sources are bound
 */

import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Checkbox } from "../../../components/ui/Checkbox";
import { SelectBox } from "../../../components/ui/SelectBox";
import { useClient } from "../../../contexts/ClientContext";
import { useNavigation } from "../../../contexts/NavigationContext";
import { useSpace } from "../../../contexts/SpaceContext";
import { formatTimestamp } from "../../../util/DateTimeUtil";
import type { Integration, Source, SpaceSource } from "jolli-common";
import { isGithubRepoMetadata } from "jolli-common";
import { GitBranch, GitCommitHorizontal, Plug, Plus, Trash2 } from "lucide-react";
import { type ReactElement, useCallback, useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";
import { toast } from "sonner";

/** Source with its space binding info, as returned by the API. */
interface BoundSource extends Source {
	binding: SpaceSource;
}

/**
 * Sources settings page for managing which sources are connected to a space.
 */
export function SpaceSourcesSettings(): ReactElement {
	const content = useIntlayer("space-settings");
	const dateTimeContent = useIntlayer("date-time");
	const { spaceSettingsSpaceId } = useNavigation();
	const { spaces } = useSpace();
	const client = useClient();

	const space = spaces.find(s => s.id === spaceSettingsSpaceId);

	const [boundSources, setBoundSources] = useState<Array<BoundSource>>([]);
	const [allSources, setAllSources] = useState<Array<Source>>([]);
	const [integrations, setIntegrations] = useState<Array<Integration>>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [selectedIntegrationId, setSelectedIntegrationId] = useState("");

	const loadData = useCallback(async () => {
		if (!spaceSettingsSpaceId) {
			return;
		}
		try {
			const [bound, sources, intgs] = await Promise.all([
				client.sources().listSpaceSources(spaceSettingsSpaceId),
				client.sources().listSources(),
				client.integrations().listIntegrations(),
			]);
			setBoundSources(bound);
			setAllSources(sources);
			setIntegrations(intgs);
		} catch (err) {
			console.error("Failed to load sources:", err);
		} finally {
			setIsLoading(false);
		}
	}, [client, spaceSettingsSpaceId]);

	useEffect(() => {
		loadData();
	}, [loadData]);

	// Integrations that don't already have a source bound to this space
	const boundIntegrationIds = new Set(boundSources.map(s => s.integrationId).filter(Boolean));
	const availableIntegrations = integrations.filter(i => i.type === "github" && !boundIntegrationIds.has(i.id));

	/** Adds an integration as a source. Creates Source record if needed, then binds to space. */
	async function handleAddSource(): Promise<void> {
		if (!spaceSettingsSpaceId || !selectedIntegrationId) {
			return;
		}
		const integrationId = Number.parseInt(selectedIntegrationId, 10);
		const integration = integrations.find(i => i.id === integrationId);
		if (!integration) {
			return;
		}
		try {
			// Check if a Source already exists for this integration
			let source = allSources.find(s => s.integrationId === integrationId);
			if (!source) {
				// Auto-create a Source from the integration metadata
				const metadata = isGithubRepoMetadata(integration.metadata) ? integration.metadata : undefined;
				source = await client.sources().createSource({
					name: integration.name,
					type: "git",
					...(metadata?.repo ? { repo: metadata.repo } : {}),
					...(metadata?.branch ? { branch: metadata.branch } : {}),
					integrationId,
				});
			}
			await client.sources().bindSource(spaceSettingsSpaceId, { sourceId: source.id });
			toast.success(content.sourceAdded.value);
			setSelectedIntegrationId("");
			await loadData();
		} catch {
			toast.error(content.sourceAddFailed.value);
		}
	}

	async function handleRemoveSource(sourceId: number): Promise<void> {
		if (!spaceSettingsSpaceId) {
			return;
		}
		try {
			await client.sources().unbindSource(spaceSettingsSpaceId, sourceId);
			toast.success(content.sourceRemoved.value);
			await loadData();
		} catch {
			toast.error(content.sourceRemoveFailed.value);
		}
	}

	async function handleToggleEnabled(sourceId: number, currentlyEnabled: boolean): Promise<void> {
		if (!spaceSettingsSpaceId) {
			return;
		}
		try {
			await client.sources().bindSource(spaceSettingsSpaceId, { sourceId, enabled: !currentlyEnabled });
			toast.success(content.sourceToggled.value);
			await loadData();
		} catch {
			toast.error(content.sourceToggleFailed.value);
		}
	}

	if (!space) {
		return (
			<div className="max-w-2xl mx-auto p-8">
				<div className="text-muted-foreground">{content.spaceNotFound}</div>
			</div>
		);
	}

	return (
		<div className="max-w-2xl mx-auto p-8">
			{/* Page Header */}
			<div className="space-y-1 mb-8">
				<h1 className="text-2xl font-semibold">{content.sourcesTitle}</h1>
				<p className="text-muted-foreground">{content.sourcesDescription}</p>
			</div>

			{/* Add Source from Integration */}
			<div className="flex items-center gap-2 mb-6" data-testid="add-source-section">
				<SelectBox
					value={selectedIntegrationId}
					onValueChange={setSelectedIntegrationId}
					options={availableIntegrations.map(i => ({
						value: String(i.id),
						label: i.name,
					}))}
					placeholder={content.selectSourcePlaceholder.value}
					width="300px"
					data-testid="source-select"
				/>
				<Button
					onClick={handleAddSource}
					disabled={!selectedIntegrationId}
					size="sm"
					data-testid="add-source-button"
				>
					<Plus className="h-4 w-4 mr-1" />
					{content.addSource}
				</Button>
			</div>

			{/* Connected Sources */}
			{isLoading ? (
				<div className="text-muted-foreground text-sm" data-testid="sources-loading">
					Loading...
				</div>
			) : boundSources.length === 0 ? (
				<div className="border border-dashed rounded-lg p-8 text-center" data-testid="sources-empty-state">
					<Plug className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
					<p className="font-medium text-foreground">{content.noSourcesTitle}</p>
					<p className="text-sm text-muted-foreground mt-1">{content.noSourcesDescription}</p>
				</div>
			) : (
				<div>
					<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
						{content.connectedSources}
					</h2>
					<div className="border rounded-lg divide-y" data-testid="sources-list">
						{boundSources.map(source => (
							<SourceRow
								key={source.id}
								source={source}
								onToggle={handleToggleEnabled}
								onRemove={handleRemoveSource}
								enabledLabel={content.enabled.value}
								disabledLabel={content.disabled.value}
								neverProcessedLabel={content.neverProcessed.value}
								dateTimeContent={dateTimeContent}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

interface SourceRowProps {
	source: BoundSource;
	onToggle(sourceId: number, currentlyEnabled: boolean): void;
	onRemove(sourceId: number): void;
	enabledLabel: string;
	disabledLabel: string;
	neverProcessedLabel: string;
	dateTimeContent: ReturnType<typeof useIntlayer<"date-time">>;
}

/** A single source row showing name, repo, branch, cursor info, enabled toggle, and remove button. */
function SourceRow({
	source,
	onToggle,
	onRemove,
	enabledLabel,
	disabledLabel,
	neverProcessedLabel,
	dateTimeContent,
}: SourceRowProps): ReactElement {
	const cursor = source.cursor;

	return (
		<div className="flex items-center justify-between px-4 py-3" data-testid={`source-row-${source.id}`}>
			<div className="flex items-center gap-3 min-w-0">
				<Plug className="h-4 w-4 text-muted-foreground flex-shrink-0" />
				<div className="min-w-0">
					<div className="font-medium text-sm truncate">{source.name}</div>
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						{source.repo && <span className="truncate">{source.repo}</span>}
						{source.branch && (
							<span className="flex items-center gap-0.5">
								<GitBranch className="h-3 w-3" />
								{source.branch}
							</span>
						)}
					</div>
					{/* Cursor: last processed SHA + relative time */}
					<div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
						{cursor ? (
							<>
								<GitCommitHorizontal className="h-3 w-3" />
								<code className="font-mono">{cursor.value.slice(0, 7)}</code>
								<span>&middot;</span>
								<span>{formatTimestamp(dateTimeContent, cursor.updatedAt, "short")}</span>
							</>
						) : (
							<span className="italic">{neverProcessedLabel}</span>
						)}
					</div>
				</div>
				<Badge variant={source.binding.enabled ? "default" : "secondary"} className="text-xs">
					{source.binding.enabled ? enabledLabel : disabledLabel}
				</Badge>
			</div>
			<div className="flex items-center gap-2 flex-shrink-0">
				<Checkbox
					checked={source.binding.enabled}
					onCheckedChange={() => onToggle(source.id, source.binding.enabled)}
					data-testid={`source-toggle-${source.id}`}
				/>
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7 text-muted-foreground hover:text-destructive"
					onClick={() => onRemove(source.id)}
					data-testid={`source-remove-${source.id}`}
				>
					<Trash2 className="h-3.5 w-3.5" />
				</Button>
			</div>
		</div>
	);
}

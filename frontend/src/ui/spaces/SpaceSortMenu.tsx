import { Button } from "../../components/ui/Button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../../components/ui/DropdownMenu";
import { toast } from "../../components/ui/Sonner";
import { useClient } from "../../contexts/ClientContext";
import { useSpace } from "../../contexts/SpaceContext";
import { getLog } from "../../util/Logger";
import type { SpaceSortOption } from "jolli-common";
import { ArrowUpDown, Check, Pin, RotateCcw } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

/**
 * Sort option label keys in the space-tree-nav content dictionary.
 */
type SortLabelKey =
	| "sortDefault"
	| "sortAlphabeticalAsc"
	| "sortAlphabeticalDesc"
	| "sortUpdatedDesc"
	| "sortUpdatedAsc"
	| "sortCreatedDesc"
	| "sortCreatedAsc";

/**
 * Sort options grouped by category.
 */
const SORT_OPTION_GROUPS: ReadonlyArray<ReadonlyArray<{ value: SpaceSortOption; labelKey: SortLabelKey }>> = [
	// Default group
	[{ value: "default", labelKey: "sortDefault" }],
	// Alphabetical group
	[
		{ value: "alphabetical_asc", labelKey: "sortAlphabeticalAsc" },
		{ value: "alphabetical_desc", labelKey: "sortAlphabeticalDesc" },
	],
	// Last Updated group
	[
		{ value: "updatedAt_desc", labelKey: "sortUpdatedDesc" },
		{ value: "updatedAt_asc", labelKey: "sortUpdatedAsc" },
	],
	// Created group
	[
		{ value: "createdAt_desc", labelKey: "sortCreatedDesc" },
		{ value: "createdAt_asc", labelKey: "sortCreatedAsc" },
	],
];

/**
 * Flattened list of all sort options for lookup.
 */
const ALL_SORT_OPTIONS = SORT_OPTION_GROUPS.flat();

export interface SpaceSortMenuProps {
	sortMode: SpaceSortOption;
	/** Whether current sort matches the space's default sort setting */
	isMatchingSpaceDefault: boolean;
	onSortModeChange: (mode: SpaceSortOption) => void;
	onResetToDefault: () => void;
	/** Callback when dropdown open state changes (for hover panel) */
	onOpenChange?: (open: boolean) => void;
}

export function SpaceSortMenu({
	sortMode,
	isMatchingSpaceDefault,
	onSortModeChange,
	onResetToDefault,
	onOpenChange,
}: SpaceSortMenuProps): ReactElement {
	const content = useIntlayer("space-tree-nav");
	const client = useClient();
	const { currentSpace, refreshSpaces } = useSpace();

	function getSortLabelKey(mode: SpaceSortOption): SortLabelKey | undefined {
		const option = ALL_SORT_OPTIONS.find(o => o.value === mode);
		return option?.labelKey;
	}

	async function handleSaveAsDefault() {
		if (!currentSpace) {
			return;
		}

		try {
			await client.spaces().updateSpace(currentSpace.id, { defaultSort: sortMode });
			await refreshSpaces();

			// Get the localized label for the sort mode
			const labelKey = getSortLabelKey(sortMode);
			const sortLabel = labelKey ? content[labelKey].value : sortMode;

			// Use .value to get the string from insertion function (same pattern as confirm dialogs)
			toast.success(content.spaceDefaultSortSaved({ sortMode: sortLabel }).value);
			log.debug("Space default sort saved.");
		} catch (error) {
			log.error(error, "Failed to save space default sort.");
		}
	}

	return (
		<DropdownMenu {...(onOpenChange ? { onOpenChange } : {})}>
			<DropdownMenuTrigger asChild>
				<Button
					variant={isMatchingSpaceDefault ? "ghost" : "secondary"}
					size="sm"
					className="h-8 gap-1"
					data-testid="space-sort-menu-trigger"
				>
					<ArrowUpDown className="h-4 w-4" />
					{content.sortButton}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-72">
				{/* Space default info */}
				<DropdownMenuLabel className="flex items-center gap-1 text-muted-foreground font-normal whitespace-nowrap">
					<Pin className="h-4 w-4 flex-shrink-0 self-center" />
					{content.spaceDefault}: {(() => {
						const defaultSort = currentSpace?.defaultSort ?? "default";
						const labelKey = getSortLabelKey(defaultSort);
						return labelKey ? content[labelKey] : defaultSort;
					})()}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />

				{/* Sort options grouped by category */}
				{SORT_OPTION_GROUPS.map((group, groupIndex) => (
					<div key={groupIndex}>
						{group.map(option => (
							<DropdownMenuItem
								key={option.value}
								onClick={() => onSortModeChange(option.value)}
								data-testid={`sort-option-${option.value}`}
							>
								<Check
									className={`h-4 w-4 mr-2 ${sortMode === option.value ? "opacity-100" : "opacity-0"}`}
								/>
								{content[option.labelKey]}
							</DropdownMenuItem>
						))}
						{groupIndex < SORT_OPTION_GROUPS.length - 1 && <DropdownMenuSeparator />}
					</div>
				))}

				{/* Conditional actions */}
				{!isMatchingSpaceDefault && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={onResetToDefault} data-testid="reset-to-default-option">
							<RotateCcw className="h-4 w-4 mr-2" />
							{content.resetToDefault}
						</DropdownMenuItem>
						<DropdownMenuItem onClick={handleSaveAsDefault} data-testid="save-as-default-option">
							<Pin className="h-4 w-4 mr-2" />
							<div className="flex flex-col">
								<span>{content.saveAsSpaceDefault}</span>
								<span className="text-xs text-muted-foreground">{content.appliesToAllMembers}</span>
							</div>
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

import { Button } from "../../components/ui/Button";
import { Calendar } from "../../components/ui/Calendar";
import { HoverTooltip } from "../../components/ui/HoverTooltip";
import { Input } from "../../components/ui/Input";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/Popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "../../components/ui/Select";
import { Separator } from "../../components/ui/Separator";
import { toast } from "../../components/ui/Sonner";
import { useClient } from "../../contexts/ClientContext";
import { useSpace } from "../../contexts/SpaceContext";
import { getLog } from "../../util/Logger";
import { normalizeFilters, type SpaceFilters, type UpdatedFilter, type UpdatedFilterPreset } from "jolli-common";
import { Filter, Info, Pin, RotateCcw } from "lucide-react";
import { type ReactElement, useCallback, useMemo, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

const log = getLog(import.meta);

/**
 * Format a Date object to ISO date string (YYYY-MM-DD) using local timezone.
 * This avoids date shifting due to UTC conversion.
 */
function formatDateToISO(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/**
 * Updated filter preset options (excluding custom date).
 */
const UPDATED_PRESET_OPTIONS: ReadonlyArray<{
	value: UpdatedFilterPreset;
	labelKey: "filterAnyTime" | "filterToday" | "filterLast7Days" | "filterLast30Days" | "filterLast3Months";
}> = [
	{ value: "any_time", labelKey: "filterAnyTime" },
	{ value: "today", labelKey: "filterToday" },
	{ value: "last_7_days", labelKey: "filterLast7Days" },
	{ value: "last_30_days", labelKey: "filterLast30Days" },
	{ value: "last_3_months", labelKey: "filterLast3Months" },
];

export interface SpaceFilterMenuProps {
	filters: SpaceFilters;
	/** Whether current filters match the space's default filters setting */
	isMatchingSpaceDefault: boolean;
	/** Number of active filter conditions (for badge display) */
	filterCount: number;
	onFiltersChange: (filters: SpaceFilters) => void;
	onResetToDefault: () => void;
	/** Callback when popover open state changes (for hover panel) */
	onOpenChange?: (open: boolean) => void;
}

/**
 * Format a date for display in the Updated filter.
 */
function formatDateForDisplay(date: string): string {
	const d = new Date(date);
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(d);
}

/**
 * Get the display value for the Updated filter.
 */
function getUpdatedDisplayValue(
	filter: UpdatedFilter,
	content: ReturnType<typeof useIntlayer<"space-tree-nav">>,
): string {
	if (typeof filter === "string") {
		const option = UPDATED_PRESET_OPTIONS.find(o => o.value === filter);
		return option ? content[option.labelKey].value : filter;
	}
	// Custom date - ensure filter has the expected structure
	if (filter && typeof filter === "object" && filter.type === "after_date" && filter.date) {
		return content.filterAfterDateFormat({ date: formatDateForDisplay(filter.date) }).value;
	}
	// Fallback for malformed filter objects
	return content.filterAnyTime.value;
}

/**
 * Format creator filter for display.
 */
function formatCreatorDisplay(
	creator: string | undefined,
	content: ReturnType<typeof useIntlayer<"space-tree-nav">>,
): string {
	/* v8 ignore start -- Defensive check for empty/invalid creator, rarely triggered in normal usage */
	if (!creator || typeof creator !== "string" || creator.trim() === "") {
		return content.filterCreatorAll.value;
	}
	/* v8 ignore stop */
	return `"${creator}"`;
}

/**
 * Build a description of the current filters for display.
 */
function buildFiltersDescription(
	filters: SpaceFilters | undefined,
	content: ReturnType<typeof useIntlayer<"space-tree-nav">>,
): string {
	/* v8 ignore start -- Defensive check for undefined filters, never triggered in normal usage */
	if (!filters) {
		return content.filterNone.value;
	}
	/* v8 ignore stop */

	const parts: Array<string> = [];

	if (filters.updated && filters.updated !== "any_time") {
		parts.push(`${content.filterUpdated.value}: ${getUpdatedDisplayValue(filters.updated, content)}`);
	}

	// Include creator info if non-empty (handle legacy data where creator might not be a string)
	if (filters.creator && typeof filters.creator === "string" && filters.creator.trim() !== "") {
		const creatorDisplay = formatCreatorDisplay(filters.creator, content);
		parts.push(`${content.filterCreator.value}: ${creatorDisplay}`);
	}

	return parts.length > 0 ? parts.join(", ") : content.filterNone.value;
}

export function SpaceFilterMenu({
	filters,
	isMatchingSpaceDefault,
	filterCount,
	onFiltersChange,
	onResetToDefault,
	onOpenChange,
}: SpaceFilterMenuProps): ReactElement {
	const content = useIntlayer("space-tree-nav");
	const client = useClient();
	const { currentSpace, refreshSpaces } = useSpace();

	// Track whether the custom date calendar is shown
	const [showDatePicker, setShowDatePicker] = useState(false);

	const updatedFilterTriggerRef = useRef<HTMLButtonElement | null>(null);

	/* v8 ignore start -- Radix Popover auto-focus handling, requires real Radix events to test */
	const handlePopoverOpenAutoFocus = useCallback((event: Event) => {
		event.preventDefault();
		updatedFilterTriggerRef.current?.focus();
	}, []);
	/* v8 ignore stop */

	const handlePopoverOpenChange = useCallback(
		(open: boolean) => {
			onOpenChange?.(open);
		},
		[onOpenChange],
	);

	// Determine the current Updated select value
	const updatedSelectValue = useMemo(() => {
		if (typeof filters.updated === "string") {
			return filters.updated;
		}
		return "after_date";
	}, [filters.updated]);

	// Handle Updated filter change
	const handleUpdatedChange = useCallback(
		(value: string) => {
			if (value === "after_date") {
				// Calculate date 3 months ago from today as default
				const today = new Date();
				const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
				const isoDate = formatDateToISO(threeMonthsAgo);

				// Update filter with default date and show date picker
				onFiltersChange({
					...filters,
					updated: { type: "after_date", date: isoDate },
				});
				setShowDatePicker(true);
			} else {
				setShowDatePicker(false);
				onFiltersChange({
					...filters,
					updated: value as UpdatedFilterPreset,
				});
			}
		},
		[filters, onFiltersChange],
	);

	// Handle date selection from calendar
	const handleDateSelect = useCallback(
		(date: Date | undefined) => {
			if (date) {
				const isoDate = formatDateToISO(date);

				onFiltersChange({
					...filters,
					updated: { type: "after_date", date: isoDate },
				});
				setShowDatePicker(false);
			}
		},
		[filters, onFiltersChange],
	);

	// Handle Creator filter change from text input
	const handleCreatorChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			onFiltersChange({
				...filters,
				creator: e.target.value,
			});
		},
		[filters, onFiltersChange],
	);

	// Save current filters as space default
	async function handleSaveAsDefault() {
		if (!currentSpace) {
			return;
		}

		try {
			await client.spaces().updateSpace(currentSpace.id, { defaultFilters: filters });
			await refreshSpaces();

			const description = buildFiltersDescription(filters, content);
			toast.success(content.spaceDefaultFiltersSaved({ description }).value);
		} catch (error) {
			log.error(error, "Failed to save space default filters.");
		}
	}

	// Get current date for the calendar (when custom date is selected)
	const selectedDate = useMemo(() => {
		if (typeof filters.updated === "object" && filters.updated.type === "after_date") {
			return new Date(filters.updated.date);
		}
		return;
	}, [filters.updated]);

	// Get default month for the calendar - show the selected date's month, or current month
	const defaultMonth = useMemo(() => {
		if (selectedDate) {
			return selectedDate;
		}
		return new Date();
	}, [selectedDate]);

	// Normalized space default filters (handles backend returning {} or partial data)
	const normalizedSpaceDefaults = useMemo(
		() => normalizeFilters(currentSpace?.defaultFilters),
		[currentSpace?.defaultFilters],
	);

	// Calculate number of space default filters
	const spaceDefaultFilterCount = useMemo(() => {
		let count = 0;

		if (normalizedSpaceDefaults.updated !== "any_time") {
			count++;
		}
		if (normalizedSpaceDefaults.creator.trim() !== "") {
			count++;
		}

		return count;
	}, [normalizedSpaceDefaults]);

	/**
	 * Handle interaction outside the Popover.
	 * Prevents the Popover from closing when clicking/focusing inside a Select dropdown.
	 *
	 * This is a workaround for a known Radix UI issue where Select inside Popover triggers
	 * unwanted dismissal events. See: https://github.com/radix-ui/primitives/issues/2224
	 *
	 * Note: onInteractOutside receives a CustomEvent with the original event in detail.originalEvent.
	 * The actual interaction target is in detail.originalEvent.target, NOT e.target.
	 */
	/* v8 ignore start -- Radix UI workaround requires real CustomEvent, cannot be triggered in test environment */
	const handleInteractOutside = useCallback((e: Event) => {
		const customEvent = e as CustomEvent<{ originalEvent: PointerEvent | FocusEvent }>;
		const originalEvent = customEvent.detail?.originalEvent;
		const target = originalEvent?.target as HTMLElement | null;

		if (!target) {
			return;
		}

		// Prevent Popover from closing when interacting with any Radix popper content (Select, Tooltip, etc.)
		// We use [data-radix-popper-content-wrapper] which is a Radix-internal attribute that wraps all
		// popper content. This approach:
		// - Covers the Updated filter's Select dropdown
		// - Automatically handles any future Radix popper components added to this Popover
		// - Only affects interactions outside the Popover (clicks on empty space still close it)
		if (target.closest("[data-radix-popper-content-wrapper]")) {
			e.preventDefault();
		}
	}, []);
	/* v8 ignore stop */

	return (
		<Popover onOpenChange={handlePopoverOpenChange}>
			<PopoverTrigger asChild>
				<Button
					variant={isMatchingSpaceDefault ? "ghost" : "secondary"}
					size="sm"
					className="h-8 gap-2"
					data-testid="space-filter-menu-trigger"
				>
					<Filter className="h-4 w-4" />
					{content.filtersButton}
					{filterCount > 0 && (
						<span
							className="ml-1 rounded-full bg-primary/20 px-1.5 text-xs font-medium"
							data-testid="filter-count-badge"
						>
							{filterCount}
						</span>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-80 p-0"
				data-testid="space-filter-menu-content"
				onOpenAutoFocus={handlePopoverOpenAutoFocus}
				onInteractOutside={handleInteractOutside}
			>
				{/* Space default info with compact badge */}
				<div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
					<Pin className="h-4 w-4 flex-shrink-0" />
					<span>
						{content.spaceDefaultFilters}:{" "}
						<span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
							{spaceDefaultFilterCount > 0
								? `${spaceDefaultFilterCount} ${spaceDefaultFilterCount === 1 ? content.filtersSingular.value : content.filtersPlural.value}`
								: content.filterNone.value}
						</span>
					</span>
					{spaceDefaultFilterCount > 0 && (
						<HoverTooltip
							content={
								<div className="space-y-1">
									<p className="font-medium text-xs">{content.defaultFiltersTooltipTitle}:</p>
									{normalizedSpaceDefaults.updated !== "any_time" && (
										<div className="flex items-start gap-1.5 text-xs">
											<span>•</span>
											<span>
												{content.filterUpdated}:{" "}
												{getUpdatedDisplayValue(normalizedSpaceDefaults.updated, content)}
											</span>
										</div>
									)}
									{normalizedSpaceDefaults.creator.trim() !== "" && (
										<div className="flex items-start gap-1.5 text-xs">
											<span>•</span>
											<span>
												{content.filterCreator}: "{normalizedSpaceDefaults.creator}"
											</span>
										</div>
									)}
								</div>
							}
							side="bottom"
							align="start"
							sideOffset={8}
							contentClassName="max-w-sm"
						>
							<button
								type="button"
								className="inline-flex items-center p-1 -m-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-help"
								aria-label={content.defaultFiltersTooltipTitle.value}
							>
								<Info className="h-3.5 w-3.5" />
							</button>
						</HoverTooltip>
					)}
				</div>

				<Separator />

				{/* Filter controls */}
				<div className="p-3 space-y-4">
					{/* Updated filter */}
					<div className="space-y-2">
						<label className="text-sm font-medium">{content.filterUpdated}</label>
						<Select value={updatedSelectValue} onValueChange={handleUpdatedChange}>
							<SelectTrigger ref={updatedFilterTriggerRef} data-testid="updated-filter-trigger">
								<SelectValue>{getUpdatedDisplayValue(filters.updated, content)}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{UPDATED_PRESET_OPTIONS.map(option => (
									<SelectItem
										key={option.value}
										value={option.value}
										data-testid={`updated-option-${option.value}`}
									>
										{content[option.labelKey]}
									</SelectItem>
								))}
								<SelectSeparator />
								<SelectItem value="after_date" data-testid="updated-option-after_date">
									{content.filterAfterDate}
								</SelectItem>
							</SelectContent>
						</Select>

						{/* Inline calendar for custom date */}
						{(showDatePicker || typeof filters.updated === "object") && (
							<div className="pt-2" data-testid="date-picker-container">
								<Calendar
									mode="single"
									selected={selectedDate}
									defaultMonth={defaultMonth}
									onSelect={handleDateSelect}
									disabled={date => date > new Date()}
									className="w-full"
									classNames={{
										root: "w-full",
									}}
								/>
							</div>
						)}
					</div>

					{/* Creator filter - text input with fuzzy matching */}
					<div className="space-y-2">
						<label className="text-sm font-medium">{content.filterCreator}</label>
						<Input
							type="text"
							value={filters.creator ?? ""}
							onChange={handleCreatorChange}
							placeholder={content.filterCreatorPlaceholder.value}
							data-testid="creator-filter-input"
						/>
					</div>
				</div>

				{/* Actions */}
				{!isMatchingSpaceDefault && (
					<>
						<Separator />
						<div className="p-2 space-y-1">
							<button
								type="button"
								className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded-md text-left"
								onClick={onResetToDefault}
								data-testid="reset-to-default-filters"
							>
								<RotateCcw className="h-4 w-4" />
								{content.resetToDefault}
							</button>
							<button
								type="button"
								className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded-md text-left"
								onClick={handleSaveAsDefault}
								data-testid="save-as-default-filters"
							>
								<Pin className="h-4 w-4" />
								<div className="flex flex-col">
									<span>{content.saveAsSpaceDefault}</span>
									<span className="text-xs text-muted-foreground">{content.appliesToAllMembers}</span>
								</div>
							</button>
						</div>
					</>
				)}
			</PopoverContent>
		</Popover>
	);
}

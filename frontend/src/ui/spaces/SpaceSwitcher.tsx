import { SpaceIcon } from "../../components/SpaceIcon";
import { Button } from "../../components/ui/Button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../../components/ui/DropdownMenu";
import { Skeleton } from "../../components/ui/Skeleton";
import { useSpace } from "../../contexts/SpaceContext";
import { CreateSpaceDialog } from "./CreateSpaceDialog";
import type { Space } from "jolli-common";
import { Check, ChevronDown, Plus } from "lucide-react";
import { type ReactElement, useMemo, useState } from "react";
import { useIntlayer } from "react-intlayer";

export interface SpaceSwitcherProps {
	/** Callback when space is switched (for clearing selections, etc.) */
	onSpaceChange?: (space: Space) => void;
	/** Callback when dropdown open state changes (for hover panel) */
	onOpenChange?: (open: boolean) => void;
}

/**
 * SpaceSwitcher component - dropdown menu to switch between spaces.
 * Shows current space name with a dropdown to select other spaces.
 * Includes option to create a new space.
 */
export function SpaceSwitcher({ onSpaceChange, onOpenChange }: SpaceSwitcherProps): ReactElement {
	const content = useIntlayer("space-switcher");
	const { currentSpace, spaces, isLoading, switchSpace, createSpace } = useSpace();
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

	function handleDropdownOpenChange(open: boolean) {
		setIsDropdownOpen(open);
		onOpenChange?.(open);
	}

	async function handleSelectSpace(space: Space) {
		if (space.id !== currentSpace?.id) {
			await switchSpace(space.id);
			onSpaceChange?.(space);
		}
		handleDropdownOpenChange(false);
	}

	function handleAddSpaceClick() {
		handleDropdownOpenChange(false);
		setIsCreateDialogOpen(true);
	}

	async function handleCreateSpace(name: string, description?: string) {
		const newSpace = await createSpace(description ? { name, description } : { name }, true);
		setIsCreateDialogOpen(false);
		onSpaceChange?.(newSpace);
	}

	function handleCloseCreateDialog() {
		setIsCreateDialogOpen(false);
	}

	// Separate personal space from company spaces
	const personalSpace = useMemo(() => spaces.find(s => s.isPersonal), [spaces]);
	const companySpaces = useMemo(() => spaces.filter(s => !s.isPersonal), [spaces]);

	// Show loading skeleton while data is loading
	if (isLoading || !currentSpace) {
		return (
			<div className="px-3 py-2">
				<Skeleton className="h-7 w-full" data-testid="space-switcher-loading" />
			</div>
		);
	}

	/** Renders the icon for a space — User icon for personal, SpaceIcon for company. */
	function renderSpaceIcon(space: Space): ReactElement {
		if (space.isPersonal) {
			return <SpaceIcon name={space.name} size={5} isPersonal />;
		}
		return <SpaceIcon name={space.name} size={5} />;
	}

	return (
		<>
			<div className="px-3 py-2">
				<DropdownMenu open={isDropdownOpen} onOpenChange={handleDropdownOpenChange}>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							className="w-full justify-between h-auto py-1.5 px-2 font-semibold text-sm"
							data-testid="space-switcher-trigger"
						>
							<div className="flex items-center gap-2 truncate flex-1 min-w-0">
								{renderSpaceIcon(currentSpace)}
								<span className="truncate">{currentSpace.name}</span>
							</div>
							<ChevronDown className="h-4 w-4 ml-1 shrink-0 opacity-50" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-56" data-testid="space-switcher-content">
						{/* Personal space pinned at top */}
						{personalSpace && (
							<>
								<DropdownMenuItem
									onClick={() => handleSelectSpace(personalSpace)}
									className="flex items-center gap-2"
									data-testid={`space-option-${personalSpace.id}`}
								>
									{renderSpaceIcon(personalSpace)}
									<span className="truncate flex-1">{personalSpace.name}</span>
									{personalSpace.id === currentSpace.id && <Check className="h-4 w-4 shrink-0" />}
								</DropdownMenuItem>
								{companySpaces.length > 0 && <DropdownMenuSeparator />}
							</>
						)}
						{/* Company spaces */}
						{companySpaces.map(space => (
							<DropdownMenuItem
								key={space.id}
								onClick={() => handleSelectSpace(space)}
								className="flex items-center gap-2"
								data-testid={`space-option-${space.id}`}
							>
								{renderSpaceIcon(space)}
								<span className="truncate flex-1">{space.name}</span>
								{space.id === currentSpace.id && <Check className="h-4 w-4 shrink-0" />}
							</DropdownMenuItem>
						))}
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={handleAddSpaceClick} data-testid="add-space-option">
							<Plus className="h-4 w-4 mr-2" />
							{content.addSpace}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<CreateSpaceDialog
				open={isCreateDialogOpen}
				onConfirm={handleCreateSpace}
				onClose={handleCloseCreateDialog}
			/>
		</>
	);
}

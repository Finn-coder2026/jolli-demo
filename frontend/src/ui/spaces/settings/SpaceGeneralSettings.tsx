/**
 * SpaceGeneralSettings - General settings page for a Space.
 *
 * Features:
 * - Space Name inline editing
 * - Description inline editing
 * - Danger Zone with delete space functionality
 */

import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Label } from "../../../components/ui/Label";
import { Separator } from "../../../components/ui/Separator";
import { Textarea } from "../../../components/ui/Textarea";
import { useNavigation } from "../../../contexts/NavigationContext";
import { useSpace } from "../../../contexts/SpaceContext";
import { DeleteSpaceDialog } from "./DeleteSpaceDialog";
import { AlertTriangle, Pencil } from "lucide-react";
import { type ReactElement, useState } from "react";
import { useIntlayer } from "react-intlayer";
import { toast } from "sonner";

/**
 * General settings page for managing space name, description, and deletion.
 */
export function SpaceGeneralSettings(): ReactElement {
	const content = useIntlayer("space-settings");
	const { spaceSettingsSpaceId, navigate } = useNavigation();
	const { spaces, updateSpace } = useSpace();

	// Find the space being configured
	const space = spaces.find(s => s.id === spaceSettingsSpaceId);

	// Local state for inline editing
	const [isEditingName, setIsEditingName] = useState(false);
	const [isEditingDescription, setIsEditingDescription] = useState(false);
	const [spaceName, setSpaceName] = useState(space?.name ?? "");
	const [spaceDescription, setSpaceDescription] = useState(space?.description ?? "");
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

	// Check if this is the last space (cannot delete)
	const isLastSpace = spaces.length === 1;
	const isPersonal = space?.isPersonal === true;

	// If space not found, show error state
	if (!space) {
		return (
			<div className="max-w-2xl mx-auto p-8">
				<div className="text-muted-foreground">{content.spaceNotFound}</div>
			</div>
		);
	}

	async function handleSaveName(): Promise<void> {
		/* v8 ignore next 3 -- Defensive check: space is always present in UI context where this handler is called */
		if (!space) {
			return;
		}
		const trimmedName = spaceName.trim();
		if (!trimmedName) {
			toast.error(content.spaceNameEmptyError.value);
			return;
		}
		try {
			await updateSpace(space.id, { name: trimmedName });
			toast.success(content.spaceRenamed({ spaceName: trimmedName }).value);
			setIsEditingName(false);
		} catch {
			toast.error(content.updateFailed.value);
		}
	}

	function handleCancelName(): void {
		/* v8 ignore next 3 -- Defensive check, space always exists when this component renders */
		if (!space) {
			return;
		}
		setSpaceName(space.name);
		setIsEditingName(false);
	}

	async function handleSaveDescription(): Promise<void> {
		/* v8 ignore next 3 -- Defensive check, space always exists when this component renders */
		if (!space) {
			return;
		}
		const trimmedDescription = spaceDescription.trim();
		try {
			// Use null (not undefined) to clear description, so Sequelize will actually update the field
			await updateSpace(space.id, { description: trimmedDescription || null });
			toast.success(content.descriptionUpdated.value);
			setIsEditingDescription(false);
		} catch {
			toast.error(content.updateFailed.value);
		}
	}

	function handleCancelDescription(): void {
		/* v8 ignore next 3 -- Defensive check, space always exists when this component renders */
		if (!space) {
			return;
		}
		setSpaceDescription(space.description ?? "");
		setIsEditingDescription(false);
	}

	function handleSpaceDeleted(): void {
		setIsDeleteDialogOpen(false);
		// Navigate back to articles after deletion
		navigate("/articles");
	}

	return (
		<div className="max-w-2xl mx-auto p-8">
			{/* Page Header */}
			<div className="space-y-1 mb-8">
				<h1 className="text-2xl font-semibold">{content.generalTitle}</h1>
				<p className="text-muted-foreground">{content.generalDescription}</p>
			</div>

			{/* Space Name */}
			<div className="space-y-2 mb-6">
				<Label>{content.spaceNameLabel}</Label>
				{isEditingName ? (
					<div className="flex items-center gap-2 max-w-md">
						<Input
							value={spaceName}
							onChange={e => setSpaceName(e.target.value)}
							placeholder={content.spaceNamePlaceholder.value}
							autoFocus
							onKeyDown={e => {
								if (e.key === "Enter") {
									handleSaveName();
								}
								if (e.key === "Escape") {
									handleCancelName();
								}
							}}
							data-testid="space-name-input"
						/>
						<Button onClick={handleSaveName} size="sm" data-testid="save-name-button">
							{content.save}
						</Button>
						<Button onClick={handleCancelName} variant="ghost" size="sm" data-testid="cancel-name-button">
							{content.cancel}
						</Button>
					</div>
				) : (
					<div className="flex items-center gap-2">
						<span className="text-foreground font-medium">{space.name}</span>
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7"
							onClick={() => {
								setSpaceName(space.name);
								setIsEditingName(true);
							}}
							disabled={isPersonal}
							data-testid="edit-name-button"
						>
							<Pencil className="h-3.5 w-3.5" />
						</Button>
					</div>
				)}
				<p className="text-xs text-muted-foreground">
					{isPersonal ? content.personalSpaceNameHint : content.spaceNameHint}
				</p>
			</div>

			{/* Space Description */}
			<div className="space-y-2 mb-8">
				<Label>{content.descriptionLabel}</Label>
				{isEditingDescription ? (
					<div className="space-y-2 max-w-md">
						<Textarea
							value={spaceDescription}
							onChange={e => setSpaceDescription(e.target.value)}
							placeholder={content.descriptionPlaceholder.value}
							autoFocus
							className="min-h-[80px] resize-y"
							onKeyDown={e => {
								if (e.key === "Escape") {
									handleCancelDescription();
								}
							}}
							data-testid="space-description-input"
						/>
						<div className="flex items-center gap-2">
							<Button onClick={handleSaveDescription} size="sm" data-testid="save-description-button">
								{content.save}
							</Button>
							<Button
								onClick={handleCancelDescription}
								variant="ghost"
								size="sm"
								data-testid="cancel-description-button"
							>
								{content.cancel}
							</Button>
						</div>
					</div>
				) : (
					<div className="flex items-start gap-2">
						<span className="text-muted-foreground text-sm">
							{space.description || <em className="text-muted-foreground/60">{content.noDescription}</em>}
						</span>
						<Button
							variant="ghost"
							size="icon"
							className="h-7 w-7 flex-shrink-0"
							onClick={() => {
								setSpaceDescription(space.description ?? "");
								setIsEditingDescription(true);
							}}
							disabled={isPersonal}
							data-testid="edit-description-button"
						>
							<Pencil className="h-3.5 w-3.5" />
						</Button>
					</div>
				)}
				<p className="text-xs text-muted-foreground">
					{isPersonal ? content.personalSpaceDescriptionHint : content.descriptionHint}
				</p>
			</div>

			<Separator className="my-6" />

			{/* Danger Zone */}
			<div className="border border-destructive/50 rounded-lg p-4 space-y-4">
				<div>
					<h2 className="text-lg font-medium flex items-center gap-2 text-destructive">
						<AlertTriangle className="h-4 w-4" />
						{content.dangerZoneTitle}
					</h2>
					<p className="text-sm text-muted-foreground">{content.dangerZoneDescription}</p>
				</div>
				<div className="flex items-center justify-between p-4 border border-destructive/30 rounded-lg bg-destructive/5">
					<div>
						<p className="font-medium text-foreground">{content.deleteSpaceTitle}</p>
						<p className="text-sm text-muted-foreground">
							{isPersonal
								? content.personalSpaceDeleteWarning
								: isLastSpace
									? content.lastSpaceWarning
									: content.deleteSpaceDescription}
						</p>
					</div>
					<Button
						variant="destructive"
						onClick={() => setIsDeleteDialogOpen(true)}
						disabled={isLastSpace || isPersonal}
						data-testid="delete-space-button"
					>
						{content.deleteSpaceButton}
					</Button>
				</div>
			</div>

			{/* Delete Space Dialog */}
			<DeleteSpaceDialog
				open={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
				space={space}
				onDeleted={handleSpaceDeleted}
			/>
		</div>
	);
}

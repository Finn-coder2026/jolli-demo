/**
 * DeleteSpaceDialog - Two-step confirmation dialog for deleting a Space.
 *
 * Features:
 * - Step 1: Choose action (move content to another space or delete all content)
 * - Step 2: Confirm by typing the space name
 * - Integrates with SpaceContext for space operations
 */

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "../../../components/ui/AlertDialog";
import { Button } from "../../../components/ui/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../../../components/ui/Dialog";
import { Input } from "../../../components/ui/Input";
import { Label } from "../../../components/ui/Label";
import { RadioGroup, RadioGroupItem } from "../../../components/ui/RadioGroup";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/Select";
import { useSpace } from "../../../contexts/SpaceContext";
import type { Space } from "jolli-common";
import { AlertTriangle } from "lucide-react";
import { type ReactElement, useState } from "react";
import { useIntlayer } from "react-intlayer";
import { toast } from "sonner";

export interface DeleteSpaceDialogProps {
	/** Whether the dialog is open */
	open: boolean;
	/** Callback when dialog open state changes */
	onOpenChange: (open: boolean) => void;
	/** The space being deleted */
	space: Space;
	/** Callback when space is successfully deleted */
	onDeleted: () => void;
}

type DeleteAction = "move" | "delete";

/**
 * Two-step confirmation dialog for deleting a Space.
 * Step 1: Choose to move content to another space or delete all content.
 * Step 2: Confirm by typing the space name.
 */
export function DeleteSpaceDialog({ open, onOpenChange, space, onDeleted }: DeleteSpaceDialogProps): ReactElement {
	const content = useIntlayer("space-settings");
	const { spaces, deleteSpace, migrateSpaceContent } = useSpace();

	// Dialog state
	const [action, setAction] = useState<DeleteAction>("move");
	const [targetSpaceId, setTargetSpaceId] = useState<string>("");
	const [showConfirmation, setShowConfirmation] = useState(false);
	const [confirmationText, setConfirmationText] = useState("");
	const [isDeleting, setIsDeleting] = useState(false);

	// Get other spaces (exclude current space)
	const otherSpaces = spaces.filter(s => s.id !== space.id);

	// Find target space name for confirmation message
	const targetSpace = otherSpaces.find(s => String(s.id) === targetSpaceId);

	// Check if confirmation text matches space name
	const isConfirmationValid = confirmationText === space.name;

	// Handle proceeding to confirmation step
	// Note: Button is disabled when action === "move" && !targetSpaceId,
	// so this function will only be called when conditions are valid
	function handleProceed(): void {
		setShowConfirmation(true);
	}

	// Handle cancel - reset all state
	function handleCancel(): void {
		onOpenChange(false);
		resetState();
	}

	// Handle back from confirmation to selection
	function handleBackToSelection(): void {
		setShowConfirmation(false);
		setConfirmationText("");
	}

	// Reset dialog state
	function resetState(): void {
		setAction("move");
		setTargetSpaceId("");
		setShowConfirmation(false);
		setConfirmationText("");
		setIsDeleting(false);
	}

	// Handle confirm delete
	// Note: Button is disabled when !isConfirmationValid,
	// so this function will only be called when confirmation is valid
	async function handleConfirmDelete(): Promise<void> {
		setIsDeleting(true);
		try {
			if (action === "move") {
				// Migrate content to target space, then soft delete source space (without content)
				await migrateSpaceContent(space.id, Number(targetSpaceId));
				toast.success(content.contentMoved({ targetSpaceName: targetSpace?.name ?? "" }).value);
			} else {
				// Cascade soft delete: soft delete space AND all its content
				await deleteSpace(space.id, true);
				toast.success(content.spaceDeleted.value);
			}

			onDeleted();
			resetState();
		} catch {
			toast.error(content.deleteFailed.value);
			setIsDeleting(false);
		}
	}

	return (
		<>
			{/* Step 1: Action Selection Dialog */}
			<Dialog
				open={open && !showConfirmation}
				onOpenChange={
					/* v8 ignore next */ nextOpen => {
						/* v8 ignore next 4 -- Dialog close callback, difficult to test with mocked Radix UI */
						if (!nextOpen) {
							resetState();
						}
						onOpenChange(nextOpen);
					}
				}
			>
				<DialogContent className="sm:max-w-md" data-testid="delete-space-dialog">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<AlertTriangle className="h-5 w-5 text-destructive" />
							{content.deleteDialogTitle({ spaceName: space.name })}
						</DialogTitle>
						<DialogDescription>{content.deleteDialogDescription}</DialogDescription>
					</DialogHeader>

					<div className="py-4">
						<RadioGroup
							value={action}
							onValueChange={v => setAction(v as DeleteAction)}
							data-testid="delete-action-radio"
						>
							{/* Move to another space option */}
							<div className="p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
								<div className="flex items-center gap-3">
									<RadioGroupItem value="move" id="move" />
									<Label htmlFor="move" className="font-medium cursor-pointer">
										{content.moveToAnotherSpace}
									</Label>
								</div>
								<div className="ml-7 mt-2">
									<p className="text-sm text-muted-foreground">
										{content.moveToAnotherSpaceDescription}
									</p>
									{action === "move" && (
										<Select value={targetSpaceId} onValueChange={setTargetSpaceId}>
											<SelectTrigger className="w-full mt-2" data-testid="target-space-select">
												<SelectValue placeholder={content.selectSpacePlaceholder.value} />
											</SelectTrigger>
											<SelectContent>
												{otherSpaces.map(s => (
													<SelectItem key={s.id} value={String(s.id)}>
														{s.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									)}
								</div>
							</div>

							{/* Delete all content option */}
							<div className="p-3 rounded-lg border border-destructive/30 hover:bg-destructive/5 transition-colors mt-2">
								<div className="flex items-center gap-3">
									<RadioGroupItem value="delete" id="delete" />
									<Label htmlFor="delete" className="font-medium cursor-pointer text-destructive">
										{content.deleteAllContent}
									</Label>
								</div>
								<p className="ml-7 mt-2 text-sm text-muted-foreground">
									{content.deleteAllContentDescription}
								</p>
							</div>
						</RadioGroup>
					</div>

					<DialogFooter className="gap-2 sm:gap-0">
						<Button variant="outline" onClick={handleCancel} data-testid="cancel-delete-button">
							{content.cancel}
						</Button>
						<Button
							variant="destructive"
							onClick={handleProceed}
							disabled={action === "move" && !targetSpaceId}
							data-testid="continue-delete-button"
						>
							{content.continueButton}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Step 2: Confirmation AlertDialog */}
			<AlertDialog
				open={showConfirmation}
				onOpenChange={open => {
					if (!open) {
						handleBackToSelection();
					}
				}}
			>
				<AlertDialogContent data-testid="confirm-delete-dialog">
					<AlertDialogHeader>
						<AlertDialogTitle className="flex items-center gap-2">
							<AlertTriangle className="h-5 w-5 text-destructive" />
							{content.confirmDeleteTitle}
						</AlertDialogTitle>
						<AlertDialogDescription className="space-y-2">
							<span className="block">
								{content.warningPrefix}
								<strong className="font-semibold">{content.warningCannotBeUndone}</strong>
								{content.warningSuffix({ spaceName: space.name })}
							</span>
							{action === "move" && targetSpace ? (
								<span className="block">
									{content.contentWillBeMoved({ targetSpaceName: targetSpace.name })}
								</span>
							) : (
								<span className="block text-destructive font-medium">
									{content.contentWillBeDeleted}
								</span>
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>

					<div className="py-4">
						<Label htmlFor="confirmation-input" className="text-sm text-foreground">
							{content.confirmDeletePrompt({ spaceName: space.name })}
						</Label>
						<Input
							id="confirmation-input"
							value={confirmationText}
							onChange={e => setConfirmationText(e.target.value)}
							placeholder={space.name}
							className="mt-2"
							autoComplete="off"
							data-testid="confirmation-input"
						/>
					</div>

					<AlertDialogFooter>
						<AlertDialogCancel onClick={handleBackToSelection} data-testid="back-to-selection-button">
							{content.cancel}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleConfirmDelete}
							disabled={!isConfirmationValid || isDeleting}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
							data-testid="confirm-delete-button"
						>
							{content.confirmDeleteButton}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

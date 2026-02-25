import { Button } from "../../../components/ui/Button";
import { SectionHeader } from "../SectionHeader";
import type { SiteWithUpdate } from "jolli-common";
import { AlertTriangle, Trash2 } from "lucide-react";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

interface DangerZoneSectionProps {
	docsite: SiteWithUpdate;
	showConfirm: boolean;
	deleting: boolean;
	onShowConfirm: (show: boolean) => void;
	onDelete: () => Promise<void>;
}

export function DangerZoneSection({
	docsite,
	showConfirm,
	deleting,
	onShowConfirm,
	onDelete,
}: DangerZoneSectionProps): ReactElement | null {
	const content = useIntlayer("site-settings-tab");

	if (docsite.status !== "active" && docsite.status !== "error") {
		return null;
	}

	return (
		<section className="space-y-4" data-testid="danger-zone-section">
			<SectionHeader
				icon={AlertTriangle}
				title={content.dangerZoneTitle}
				description={content.dangerZoneDescription}
				variant="destructive"
			/>

			<div className="border border-destructive/20 rounded-lg p-4 bg-destructive/5">
				{showConfirm ? (
					<DeleteConfirmation
						deleting={deleting}
						onCancel={() => onShowConfirm(false)}
						onConfirm={onDelete}
					/>
				) : (
					<div className="flex items-center justify-between gap-4">
						<div className="flex-1">
							<div className="text-sm font-medium">{content.deleteSiteLabel}</div>
							<p className="text-xs text-muted-foreground mt-0.5">{content.deleteSiteDescription}</p>
						</div>
						<Button
							variant="destructive"
							size="sm"
							onClick={() => onShowConfirm(true)}
							data-testid="delete-site-button"
						>
							<Trash2 className="h-4 w-4 mr-1.5" />
							{content.deleteSiteButton}
						</Button>
					</div>
				)}
			</div>
		</section>
	);
}

interface DeleteConfirmationProps {
	deleting: boolean;
	onCancel: () => void;
	onConfirm: () => Promise<void>;
}

function DeleteConfirmation({ deleting, onCancel, onConfirm }: DeleteConfirmationProps): ReactElement {
	const content = useIntlayer("site-settings-tab");

	return (
		<div className="space-y-3">
			<p className="text-sm">{content.deleteSiteDescription}</p>
			<p className="text-sm text-destructive font-medium">{content.deleteConfirmWarning}</p>
			<div className="flex items-center gap-2 justify-end">
				<Button
					variant="outline"
					size="sm"
					onClick={onCancel}
					disabled={deleting}
					data-testid="cancel-delete-button"
				>
					{content.cancelButton}
				</Button>
				<Button
					variant="destructive"
					size="sm"
					onClick={onConfirm}
					disabled={deleting}
					data-testid="confirm-delete-button"
				>
					{deleting ? content.deletingButton : content.deletePermanentlyButton}
				</Button>
			</div>
		</div>
	);
}

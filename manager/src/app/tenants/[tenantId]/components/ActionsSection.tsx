import type { Tenant } from "../../../../lib/types";

type SafeTenant = Omit<Tenant, "databasePasswordEncrypted">;

interface ActionsSectionProps {
	tenant: SafeTenant;
	actionLoading: boolean;
	handleReset: () => void;
	handleArchive: () => void;
	setDeleteDialogOpen: (open: boolean) => void;
}

export function ActionsSection({
	tenant,
	actionLoading,
	handleReset,
	handleArchive,
	setDeleteDialogOpen,
}: ActionsSectionProps) {
	return (
		<section style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: "1px solid #eee" }}>
			<h2>Actions</h2>
			<div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
				{tenant.status !== "provisioning" && (
					<button
						type="button"
						onClick={handleReset}
						disabled={actionLoading}
						style={{
							padding: "0.5rem 1rem",
							backgroundColor: actionLoading ? "#ccc" : "#ffc107",
							color: "#212529",
							border: "none",
							borderRadius: "4px",
							cursor: actionLoading ? "not-allowed" : "pointer",
						}}
					>
						Reset to Provisioning
					</button>
				)}
				{tenant.status === "active" && (
					<button
						type="button"
						onClick={handleArchive}
						disabled={actionLoading}
						style={{
							padding: "0.5rem 1rem",
							backgroundColor: actionLoading ? "#ccc" : "#6c757d",
							color: "white",
							border: "none",
							borderRadius: "4px",
							cursor: actionLoading ? "not-allowed" : "pointer",
						}}
					>
						Archive Tenant
					</button>
				)}
				<button
					type="button"
					onClick={() => setDeleteDialogOpen(true)}
					disabled={actionLoading}
					style={{
						padding: "0.5rem 1rem",
						backgroundColor: actionLoading ? "#ccc" : "#dc3545",
						color: "white",
						border: "none",
						borderRadius: "4px",
						cursor: actionLoading ? "not-allowed" : "pointer",
					}}
				>
					Delete Tenant
				</button>
			</div>
		</section>
	);
}

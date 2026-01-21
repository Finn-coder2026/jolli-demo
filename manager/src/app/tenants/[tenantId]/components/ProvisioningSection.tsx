interface ProvisioningSectionProps {
	actionLoading: boolean;
	schemaConflict: boolean;
	reuseExisting: boolean;
	setReuseExisting: (value: boolean) => void;
	handleProvision: () => void;
	handleProvisionWithForce: () => void;
}

export function ProvisioningSection({
	actionLoading,
	schemaConflict,
	reuseExisting,
	setReuseExisting,
	handleProvision,
	handleProvisionWithForce,
}: ProvisioningSectionProps) {
	if (schemaConflict) {
		return (
			<section style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#fff3cd", borderRadius: "4px" }}>
				<p style={{ margin: "0 0 1rem 0", color: "#856404", fontWeight: "bold" }}>
					Choose how to handle the existing schema:
				</p>
				<div style={{ display: "flex", gap: "1rem", flexDirection: "column" }}>
					<div style={{ display: "flex", gap: "1rem" }}>
						<button
							type="button"
							onClick={handleProvision}
							disabled={actionLoading}
							style={{
								padding: "0.5rem 1rem",
								backgroundColor: actionLoading ? "#ccc" : "#28a745",
								color: "white",
								border: "none",
								borderRadius: "4px",
								cursor: actionLoading ? "not-allowed" : "pointer",
								flex: 1,
							}}
						>
							{actionLoading ? "Processing..." : "Reuse Existing Schema"}
						</button>
						<button
							type="button"
							onClick={handleProvisionWithForce}
							disabled={actionLoading}
							style={{
								padding: "0.5rem 1rem",
								backgroundColor: actionLoading ? "#ccc" : "#dc3545",
								color: "white",
								border: "none",
								borderRadius: "4px",
								cursor: actionLoading ? "not-allowed" : "pointer",
								flex: 1,
							}}
						>
							{actionLoading ? "Processing..." : "Drop and Recreate Schema"}
						</button>
					</div>
					<p style={{ margin: 0, fontSize: "0.75rem", color: "#856404" }}>
						Warning: "Drop and Recreate" will delete all data in the existing schema.
					</p>
				</div>
			</section>
		);
	}

	return (
		<section style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#fff3cd", borderRadius: "4px" }}>
			<p style={{ margin: "0 0 1rem 0", color: "#856404" }}>
				This tenant needs to be provisioned. Click the button below to create the schema.
			</p>
			<div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
				<button
					type="button"
					onClick={handleProvision}
					disabled={actionLoading}
					style={{
						padding: "0.5rem 1rem",
						backgroundColor: actionLoading ? "#ccc" : "#28a745",
						color: "white",
						border: "none",
						borderRadius: "4px",
						cursor: actionLoading ? "not-allowed" : "pointer",
					}}
				>
					{actionLoading ? "Provisioning..." : "Provision Schema"}
				</button>
				<label
					style={{
						display: "flex",
						alignItems: "center",
						gap: "0.5rem",
						cursor: "pointer",
					}}
				>
					<input
						type="checkbox"
						checked={reuseExisting}
						onChange={e => setReuseExisting(e.target.checked)}
						disabled={actionLoading}
						style={{ cursor: actionLoading ? "not-allowed" : "pointer" }}
					/>
					<span style={{ fontSize: "0.875rem", color: "#856404" }}>Reuse existing schema if found</span>
				</label>
			</div>
		</section>
	);
}

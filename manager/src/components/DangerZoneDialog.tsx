"use client";

import { useState } from "react";

export interface DangerZoneDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onConfirm: (mode: "soft" | "hard") => Promise<void>;
	title: string;
	resourceName: string;
	confirmationSlug: string;
	warningMessage: string;
	showSoftDelete?: boolean; // Default: true (for backward compatibility with tenants)
	showHardDelete?: boolean; // Default: true (can be disabled via config)
}

export function DangerZoneDialog({
	isOpen,
	onClose,
	onConfirm,
	title,
	resourceName,
	confirmationSlug,
	warningMessage,
	showSoftDelete = true,
	showHardDelete = true,
}: DangerZoneDialogProps) {
	// Determine initial mode based on available options
	function getInitialMode(): "soft" | "hard" {
		if (!showHardDelete && showSoftDelete) {
			return "soft";
		}
		if (showHardDelete && !showSoftDelete) {
			return "hard";
		}
		return showSoftDelete ? "soft" : "hard";
	}

	const [mode, setMode] = useState<"soft" | "hard">(getInitialMode());
	const [confirmInput, setConfirmInput] = useState("");
	const [isDeleting, setIsDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const isConfirmed = confirmInput === confirmationSlug;

	async function handleConfirm() {
		if (!isConfirmed) {
			return;
		}

		setIsDeleting(true);
		setError(null);
		try {
			await onConfirm(mode);
			// Success - dialog will be closed by parent
			setConfirmInput("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setIsDeleting(false);
		}
	}

	function handleClose() {
		if (isDeleting) {
			return;
		}
		setConfirmInput("");
		setError(null);
		onClose();
	}

	if (!isOpen) {
		return null;
	}

	return (
		<div
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				backgroundColor: "rgba(0, 0, 0, 0.5)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 1000,
			}}
			onClick={handleClose}
		>
			<div
				style={{
					backgroundColor: "white",
					borderRadius: "8px",
					padding: "2rem",
					maxWidth: "500px",
					width: "90%",
					border: "3px solid #dc3545",
				}}
				onClick={e => e.stopPropagation()}
			>
				<h2 style={{ margin: "0 0 1rem 0", color: "#dc3545" }}>{title}</h2>

				<div
					style={{
						padding: "1rem",
						backgroundColor: "#f8d7da",
						borderLeft: "4px solid #dc3545",
						marginBottom: "1.5rem",
						borderRadius: "4px",
					}}
				>
					<p style={{ margin: 0, color: "#721c24", fontSize: "0.9rem" }}>{warningMessage}</p>
				</div>

				{error && (
					<div
						style={{
							padding: "1rem",
							backgroundColor: "#f8d7da",
							color: "#721c24",
							borderRadius: "4px",
							marginBottom: "1rem",
						}}
					>
						{error}
					</div>
				)}

				{(showSoftDelete || showHardDelete) && (
					<div style={{ marginBottom: "1.5rem" }}>
						<label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>
							Deletion Mode
						</label>
						<div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
							{showSoftDelete && (
								<label
									style={{
										display: "flex",
										alignItems: "start",
										padding: "0.75rem",
										border: `2px solid ${mode === "soft" ? "#007bff" : "#dee2e6"}`,
										borderRadius: "4px",
										cursor: "pointer",
										backgroundColor: mode === "soft" ? "#e7f3ff" : "transparent",
									}}
								>
									<input
										type="radio"
										value="soft"
										checked={mode === "soft"}
										onChange={() => setMode("soft")}
										style={{ marginRight: "0.75rem", marginTop: "0.125rem" }}
									/>
									<div>
										<div style={{ fontWeight: "bold", marginBottom: "0.25rem" }}>
											Soft Delete (Keep Database/Schema)
										</div>
										<div style={{ fontSize: "0.875rem", color: "#666" }}>
											Remove from registry but preserve the database/schema. You can re-provision
											with reuseExisting=true.
										</div>
									</div>
								</label>
							)}

							{showHardDelete && (
								<label
									style={{
										display: "flex",
										alignItems: "start",
										padding: "0.75rem",
										border: `2px solid ${mode === "hard" ? "#dc3545" : "#dee2e6"}`,
										borderRadius: "4px",
										cursor: "pointer",
										backgroundColor: mode === "hard" ? "#f8d7da" : "transparent",
									}}
								>
									<input
										type="radio"
										value="hard"
										checked={mode === "hard"}
										onChange={() => setMode("hard")}
										style={{ marginRight: "0.75rem", marginTop: "0.125rem" }}
									/>
									<div>
										<div style={{ fontWeight: "bold", marginBottom: "0.25rem", color: "#dc3545" }}>
											Hard Delete (Permanent)
										</div>
										<div style={{ fontSize: "0.875rem", color: "#666" }}>
											Permanently delete {resourceName} and drop the database/schema. This cannot
											be undone.
										</div>
									</div>
								</label>
							)}
						</div>
					</div>
				)}

				<div style={{ marginBottom: "1.5rem" }}>
					<label
						htmlFor="confirm-input"
						style={{
							display: "block",
							marginBottom: "0.5rem",
							fontWeight: "bold",
						}}
					>
						Type{" "}
						<code style={{ backgroundColor: "#f5f5f5", padding: "0.125rem 0.375rem" }}>
							{confirmationSlug}
						</code>{" "}
						to confirm
					</label>
					<input
						id="confirm-input"
						type="text"
						value={confirmInput}
						onChange={e => setConfirmInput(e.target.value)}
						placeholder={confirmationSlug}
						disabled={isDeleting}
						style={{
							width: "100%",
							padding: "0.5rem",
							border: "1px solid #dee2e6",
							borderRadius: "4px",
							fontSize: "1rem",
							fontFamily: "monospace",
						}}
					/>
				</div>

				<div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
					<button
						type="button"
						onClick={handleClose}
						disabled={isDeleting}
						style={{
							padding: "0.5rem 1rem",
							backgroundColor: "white",
							color: "#212529",
							border: "1px solid #dee2e6",
							borderRadius: "4px",
							cursor: isDeleting ? "not-allowed" : "pointer",
						}}
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleConfirm}
						disabled={!isConfirmed || isDeleting}
						style={{
							padding: "0.5rem 1rem",
							backgroundColor:
								!isConfirmed || isDeleting ? "#ccc" : mode === "hard" ? "#dc3545" : "#ffc107",
							color: "white",
							border: "none",
							borderRadius: "4px",
							cursor: !isConfirmed || isDeleting ? "not-allowed" : "pointer",
							fontWeight: "bold",
						}}
					>
						{isDeleting ? "Deleting..." : `Delete ${resourceName}`}
					</button>
				</div>
			</div>
		</div>
	);
}

"use client";

import { Breadcrumb } from "../../../../../components/Breadcrumb";
import type { TenantDomain } from "../../../../../lib/types";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface VerificationResult {
	verified: boolean;
	error?: string;
	expectedRecord?: string;
	foundRecords?: Array<string>;
	instructions?: string;
	message?: string;
}

export default function DomainDetailPage() {
	const params = useParams();
	const router = useRouter();
	const tenantId = params.tenantId as string;
	const domainId = params.domainId as string;

	const [tenantName, setTenantName] = useState<string>("");
	const [domain, setDomain] = useState<TenantDomain | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [verifying, setVerifying] = useState(false);
	const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [settingPrimary, setSettingPrimary] = useState(false);

	useEffect(() => {
		async function loadData() {
			try {
				const [tenantResponse, domainResponse] = await Promise.all([
					fetch(`/api/tenants/${tenantId}`),
					fetch(`/api/tenants/${tenantId}/domains/${domainId}`),
				]);

				if (!tenantResponse.ok || !domainResponse.ok) {
					if (tenantResponse.status === 404 || domainResponse.status === 404) {
						throw new Error("Not found");
					}
					throw new Error("Failed to load data");
				}

				const tenantData = await tenantResponse.json();
				const domainData = await domainResponse.json();

				setTenantName(tenantData.tenant.displayName);
				setDomain(domainData.domain);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
			}
		}
		loadData();
	}, [tenantId, domainId]);

	async function handleVerify() {
		setVerifying(true);
		setVerificationResult(null);

		try {
			const response = await fetch(`/api/tenants/${tenantId}/domains/${domainId}/verify`, {
				method: "POST",
			});

			const data = await response.json();
			setVerificationResult(data);

			// Reload domain if verification succeeded
			if (data.verified) {
				const domainResponse = await fetch(`/api/tenants/${tenantId}/domains/${domainId}`);
				if (domainResponse.ok) {
					const domainData = await domainResponse.json();
					setDomain(domainData.domain);
				}
			}
		} catch (err) {
			setVerificationResult({
				verified: false,
				error: err instanceof Error ? err.message : "Unknown error",
			});
		} finally {
			setVerifying(false);
		}
	}

	async function handleSetPrimary() {
		setSettingPrimary(true);
		try {
			const response = await fetch(`/api/tenants/${tenantId}/domains/${domainId}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ isPrimary: true }),
			});

			if (response.ok) {
				const data = await response.json();
				setDomain(data.domain);
			}
		} finally {
			setSettingPrimary(false);
		}
	}

	async function handleDelete() {
		if (!confirm("Are you sure you want to delete this domain? This action cannot be undone.")) {
			return;
		}

		setDeleting(true);
		try {
			const response = await fetch(`/api/tenants/${tenantId}/domains/${domainId}`, {
				method: "DELETE",
			});

			if (response.ok) {
				router.push(`/tenants/${tenantId}/domains`);
			} else {
				const data = await response.json();
				setError(data.error || "Failed to delete domain");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setDeleting(false);
		}
	}

	if (loading) {
		return (
			<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
				<p>Loading...</p>
			</main>
		);
	}

	if (error || !domain) {
		return (
			<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
				<p style={{ color: "red" }}>Error: {error || "Domain not found"}</p>
				<Link href={`/tenants/${tenantId}/domains`}>Back to Domains</Link>
			</main>
		);
	}

	return (
		<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: "800px" }}>
			<Breadcrumb
				items={[
					{ label: "Dashboard", href: "/" },
					{ label: "Tenants", href: "/tenants" },
					{ label: tenantName || "Tenant", href: `/tenants/${tenantId}` },
					{ label: "Domains", href: `/tenants/${tenantId}/domains` },
					{ label: domain.domain },
				]}
			/>

			<h1>{domain.domain}</h1>

			{/* Status Summary */}
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
					gap: "1rem",
					marginBottom: "2rem",
				}}
			>
				<StatusCard label="Primary" value={domain.isPrimary ? "Yes" : "No"} />
				<StatusCard label="Verified" value={domain.verifiedAt ? "Yes" : "Pending"} />
				<StatusCard label="SSL Status" value={domain.sslStatus} />
				<StatusCard label="Created" value={new Date(domain.createdAt).toLocaleDateString()} />
			</div>

			{/* Verification Section */}
			{!domain.verifiedAt && (
				<div
					style={{
						padding: "1.5rem",
						backgroundColor: "#fff3cd",
						borderRadius: "8px",
						marginBottom: "2rem",
					}}
				>
					<h2 style={{ marginTop: 0, color: "#856404" }}>Domain Verification Required</h2>
					<p style={{ color: "#856404" }}>
						To verify ownership of this domain, add the following DNS TXT record:
					</p>

					<div
						style={{
							backgroundColor: "white",
							padding: "1rem",
							borderRadius: "4px",
							fontFamily: "monospace",
							marginBottom: "1rem",
						}}
					>
						<p style={{ margin: "0 0 0.5rem" }}>
							<strong>Record Type:</strong> TXT
						</p>
						<p style={{ margin: "0 0 0.5rem" }}>
							<strong>Record Name:</strong> _jolli-verification.{domain.domain}
						</p>
						<p style={{ margin: 0 }}>
							<strong>Record Value:</strong> jolli-verify={domain.verificationToken}
						</p>
					</div>

					<button
						type="button"
						onClick={handleVerify}
						disabled={verifying}
						style={{
							padding: "0.5rem 1rem",
							backgroundColor: verifying ? "#6c757d" : "#28a745",
							color: "white",
							border: "none",
							borderRadius: "4px",
							cursor: verifying ? "not-allowed" : "pointer",
						}}
					>
						{verifying ? "Verifying..." : "Verify Now"}
					</button>

					{verificationResult && (
						<div
							style={{
								marginTop: "1rem",
								padding: "1rem",
								backgroundColor: verificationResult.verified ? "#d4edda" : "#f8d7da",
								borderRadius: "4px",
								color: verificationResult.verified ? "#155724" : "#721c24",
							}}
						>
							{verificationResult.verified ? (
								<p style={{ margin: 0 }}>Domain verified successfully!</p>
							) : (
								<>
									<p style={{ margin: "0 0 0.5rem" }}>
										<strong>Verification failed:</strong> {verificationResult.error}
									</p>
									{verificationResult.foundRecords && verificationResult.foundRecords.length > 0 && (
										<p style={{ margin: 0, fontSize: "0.875rem" }}>
											Found records: {verificationResult.foundRecords.join(", ")}
										</p>
									)}
								</>
							)}
						</div>
					)}
				</div>
			)}

			{/* Actions */}
			<div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
				{!domain.isPrimary && (
					<button
						type="button"
						onClick={handleSetPrimary}
						disabled={settingPrimary}
						style={{
							padding: "0.5rem 1rem",
							backgroundColor: settingPrimary ? "#6c757d" : "#007bff",
							color: "white",
							border: "none",
							borderRadius: "4px",
							cursor: settingPrimary ? "not-allowed" : "pointer",
						}}
					>
						{settingPrimary ? "Setting..." : "Set as Primary"}
					</button>
				)}

				<button
					type="button"
					onClick={handleDelete}
					disabled={deleting}
					style={{
						padding: "0.5rem 1rem",
						backgroundColor: deleting ? "#6c757d" : "#dc3545",
						color: "white",
						border: "none",
						borderRadius: "4px",
						cursor: deleting ? "not-allowed" : "pointer",
					}}
				>
					{deleting ? "Deleting..." : "Delete Domain"}
				</button>

				<Link
					href={`/tenants/${tenantId}/domains`}
					style={{
						padding: "0.5rem 1rem",
						backgroundColor: "#f8f9fa",
						color: "#333",
						textDecoration: "none",
						borderRadius: "4px",
						border: "1px solid #ccc",
					}}
				>
					Back to Domains
				</Link>
			</div>
		</main>
	);
}

function StatusCard({ label, value }: { label: string; value: string }) {
	return (
		<div
			style={{
				padding: "1rem",
				backgroundColor: "#f8f9fa",
				borderRadius: "8px",
			}}
		>
			<div style={{ fontSize: "0.875rem", color: "#666", marginBottom: "0.25rem" }}>{label}</div>
			<div style={{ fontSize: "1.125rem", fontWeight: "bold" }}>{value}</div>
		</div>
	);
}

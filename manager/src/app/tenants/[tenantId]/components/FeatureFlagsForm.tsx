"use client";

import type { PricingTier, TenantFeatureFlags } from "../../../../lib/types/Tenant";
import {
	computeFeatureFlagsForTier,
	FEATURE_DEFINITIONS,
	getDefaultFeatureFlags,
	getTierLevel,
	TIER_DESCRIPTIONS,
	TIER_OPTIONS,
} from "./FeatureFlagsUtils";
import { useState } from "react";

interface FeatureFlagsFormProps {
	tenantId: string;
	featureFlags: TenantFeatureFlags;
	onSaved: () => void;
}

export function FeatureFlagsForm({ tenantId, featureFlags, onSaved }: FeatureFlagsFormProps) {
	const [formValues, setFormValues] = useState<TenantFeatureFlags>(() => getDefaultFeatureFlags(featureFlags));
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);

	function handleTierChange(tier: PricingTier) {
		setFormValues(prev => computeFeatureFlagsForTier(prev, tier));
		setSuccess(false);
	}

	function handleFeatureChange(key: keyof Omit<TenantFeatureFlags, "tier">, enabled: boolean) {
		setFormValues(prev => ({ ...prev, [key]: enabled }));
		setSuccess(false);
	}

	async function handleSave() {
		setSaving(true);
		setError(null);
		setSuccess(false);

		try {
			const response = await fetch(`/api/tenants/${tenantId}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ featureFlags: formValues }),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error ?? "Failed to save feature flags");
			}

			setSuccess(true);
			onSaved();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setSaving(false);
		}
	}

	function handleReset() {
		setFormValues(getDefaultFeatureFlags(featureFlags));
		setError(null);
		setSuccess(false);
	}

	const currentTierLevel = getTierLevel(formValues.tier ?? "free");

	return (
		<div>
			{error && (
				<div
					style={{
						padding: "0.75rem",
						backgroundColor: "#f8d7da",
						color: "#721c24",
						borderRadius: "4px",
						marginBottom: "1rem",
					}}
				>
					{error}
				</div>
			)}
			{success && (
				<div
					style={{
						padding: "0.75rem",
						backgroundColor: "#d4edda",
						color: "#155724",
						borderRadius: "4px",
						marginBottom: "1rem",
					}}
				>
					Feature flags updated successfully!
				</div>
			)}

			{/* Pricing Tier Selection */}
			<div style={{ marginBottom: "2rem" }}>
				<h4 style={{ marginBottom: "0.75rem", color: "#333" }}>Pricing Tier</h4>
				<div style={{ marginBottom: "1rem" }}>
					<label style={{ display: "block", fontWeight: "500", marginBottom: "0.25rem" }} htmlFor="tier">
						Tenant Tier
					</label>
					<p style={{ fontSize: "0.875rem", color: "#666", margin: "0 0 0.5rem 0" }}>
						Select the pricing tier for this tenant. Features are automatically enabled/disabled based on
						tier.
					</p>
					<select
						id="tier"
						value={formValues.tier ?? "free"}
						onChange={e => handleTierChange(e.target.value as PricingTier)}
						style={{
							width: "100%",
							maxWidth: "400px",
							padding: "0.5rem",
							borderRadius: "4px",
							border: "1px solid #ccc",
							fontSize: "1rem",
						}}
					>
						{TIER_OPTIONS.map(tier => (
							<option key={tier} value={tier}>
								{tier.charAt(0).toUpperCase() + tier.slice(1)} - {TIER_DESCRIPTIONS[tier]}
							</option>
						))}
					</select>
				</div>
			</div>

			{/* Feature Flags */}
			<div style={{ marginBottom: "2rem" }}>
				<h4 style={{ marginBottom: "0.75rem", color: "#333" }}>Features</h4>
				<p style={{ fontSize: "0.875rem", color: "#666", marginBottom: "1rem" }}>
					Enable or disable specific features for this tenant. Some features require minimum tier levels.
				</p>

				{FEATURE_DEFINITIONS.map(def => {
					const requiredTierLevel = getTierLevel(def.requiredTier);
					const isAvailable = currentTierLevel >= requiredTierLevel;
					const isEnabled = formValues[def.key] === true;

					return (
						<div
							key={def.key}
							style={{
								marginBottom: "1rem",
								padding: "1rem",
								borderRadius: "4px",
								backgroundColor: isAvailable ? "#f8f9fa" : "#e9ecef",
								opacity: isAvailable ? 1 : 0.6,
							}}
						>
							<label
								style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", cursor: "pointer" }}
							>
								<input
									type="checkbox"
									checked={isEnabled}
									disabled={!isAvailable}
									onChange={e => handleFeatureChange(def.key, e.target.checked)}
									style={{
										marginTop: "0.25rem",
										width: "18px",
										height: "18px",
										cursor: isAvailable ? "pointer" : "not-allowed",
									}}
								/>
								<div style={{ flex: 1 }}>
									<div style={{ fontWeight: "500", marginBottom: "0.25rem" }}>
										{def.label}
										{!isAvailable && (
											<span
												style={{
													marginLeft: "0.5rem",
													padding: "0.125rem 0.375rem",
													borderRadius: "4px",
													backgroundColor: "#ffc107",
													color: "#856404",
													fontSize: "0.75rem",
													fontWeight: "normal",
												}}
											>
												Requires {def.requiredTier}+
											</span>
										)}
									</div>
									<p style={{ fontSize: "0.875rem", color: "#666", margin: 0 }}>{def.description}</p>
								</div>
							</label>
						</div>
					);
				})}
			</div>

			<div style={{ display: "flex", gap: "0.5rem" }}>
				<button
					type="button"
					onClick={handleSave}
					disabled={saving}
					style={{
						padding: "0.5rem 1rem",
						backgroundColor: saving ? "#ccc" : "#28a745",
						color: "white",
						border: "none",
						borderRadius: "4px",
						cursor: saving ? "not-allowed" : "pointer",
						fontSize: "1rem",
						fontWeight: "500",
					}}
				>
					{saving ? "Saving..." : "Save Feature Flags"}
				</button>
				<button
					type="button"
					onClick={handleReset}
					disabled={saving}
					style={{
						padding: "0.5rem 1rem",
						backgroundColor: "#6c757d",
						color: "white",
						border: "none",
						borderRadius: "4px",
						cursor: saving ? "not-allowed" : "pointer",
						fontSize: "1rem",
					}}
				>
					Reset
				</button>
			</div>
		</div>
	);
}

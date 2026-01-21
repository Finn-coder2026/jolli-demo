"use client";

import { useState } from "react";

/**
 * Keys that can be overridden at tenant level.
 * This list should match ALLOWED_TENANT_CONFIG_KEYS in backend Config.ts
 */
const CONFIG_DEFINITIONS = [
	// Auth
	{
		key: "AUTH_EMAILS",
		label: "Authorized Email Patterns",
		type: "text" as const,
		description:
			'Comma-separated regex patterns for allowed emails (e.g., "@company\\.com$,admin@.*"). Use "*" to allow all emails.',
		group: "Auth",
	},
	{
		key: "MAX_SEATS",
		label: "Max Seats",
		type: "text" as const,
		description:
			'Maximum number of users for this tenant. Enter "unlimited" for no limit, or a number (default: 5).',
		group: "Auth",
	},
	{
		key: "ENABLED_AUTH_PROVIDERS",
		label: "Enabled Auth Providers",
		type: "text" as const,
		description: "Comma-separated list of enabled auth providers (default: jolli_google,jolli_github)",
		group: "Auth",
	},
	// API Keys
	{
		key: "ANTHROPIC_API_KEY",
		label: "Anthropic API Key",
		type: "password" as const,
		description: "API key for Anthropic Claude models",
		group: "API Keys",
	},
	{
		key: "E2B_API_KEY",
		label: "E2B API Key",
		type: "password" as const,
		description: "API key for E2B sandbox execution",
		group: "API Keys",
	},
	// AWS
	{
		key: "AWS_OIDC_ROLE_ARN",
		label: "AWS OIDC Role ARN",
		type: "text" as const,
		description: "ARN of the IAM role to assume via OIDC",
		group: "AWS",
	},
	{
		key: "AWS_REGION",
		label: "AWS Region",
		type: "text" as const,
		description: "AWS region for services (default: us-west-2)",
		group: "AWS",
	},
	// E2B
	{
		key: "E2B_TEMPLATE_ID",
		label: "E2B Template ID",
		type: "text" as const,
		description: "Template ID for E2B sandbox",
		group: "E2B",
	},
	// Token
	{
		key: "TOKEN_ALGORITHM",
		label: "Token Algorithm",
		type: "select" as const,
		options: ["HS256", "HS384", "HS512", "RS256", "RS384", "RS512"],
		description: "JWT signing algorithm",
		group: "Token",
	},
	{
		key: "TOKEN_EXPIRES_IN",
		label: "Token Expiration",
		type: "text" as const,
		description: 'Token expiration time (e.g., "34d", "1h", "30m")',
		group: "Token",
	},
	// Dev Tools
	{
		key: "USE_DEVELOPER_TOOLS",
		label: "Enable Developer Tools",
		type: "boolean" as const,
		description: "Enable developer tools UI",
		group: "Dev Tools",
	},
	{
		key: "DEV_TOOLS_GITHUB_APP_NAME",
		label: "Dev Tools GitHub App Name",
		type: "text" as const,
		description: "Name of the GitHub App for dev tools",
		group: "Dev Tools",
	},
	{
		key: "USE_DEV_TOOLS_GITHUB_APP_CREATED",
		label: "Show GitHub App Created Tool",
		type: "boolean" as const,
		description: "Show the GitHub App Created dev tool",
		group: "Dev Tools",
	},
	{
		key: "USE_DEV_TOOLS_JOB_TESTER",
		label: "Show Job Tester Tool",
		type: "boolean" as const,
		description: "Show the Job Tester dev tool",
		group: "Dev Tools",
	},
	{
		key: "USE_DEV_TOOLS_DATA_CLEARER",
		label: "Show Data Clearer Tool",
		type: "boolean" as const,
		description: "Show the Data Clearer dev tool",
		group: "Dev Tools",
	},
] as const;

type ConfigDefinition = (typeof CONFIG_DEFINITIONS)[number];

interface TenantConfigFormProps {
	tenantId: string;
	configs: Record<string, unknown>;
	onSaved: () => void;
}

export function TenantConfigForm({ tenantId, configs, onSaved }: TenantConfigFormProps) {
	const [formValues, setFormValues] = useState<Record<string, string | boolean>>(() => {
		const initial: Record<string, string | boolean> = {};
		for (const def of CONFIG_DEFINITIONS) {
			const value = configs[def.key];
			if (def.type === "boolean") {
				initial[def.key] = value === true || value === "true";
			} else {
				initial[def.key] = value !== undefined && value !== null ? String(value) : "";
			}
		}
		return initial;
	});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);

	function handleChange(key: string, value: string | boolean) {
		setFormValues(prev => ({ ...prev, [key]: value }));
		setSuccess(false);
	}

	async function handleSave() {
		setSaving(true);
		setError(null);
		setSuccess(false);

		try {
			// Build configs object with only non-empty values
			const newConfigs: Record<string, unknown> = {};
			for (const def of CONFIG_DEFINITIONS) {
				const value = formValues[def.key];
				if (def.type === "boolean") {
					// Only include if true
					if (value === true) {
						newConfigs[def.key] = true;
					}
				} else {
					// Only include non-empty strings
					if (value && String(value).trim() !== "") {
						newConfigs[def.key] = String(value).trim();
					}
				}
			}

			const response = await fetch(`/api/tenants/${tenantId}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ configs: newConfigs }),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error ?? "Failed to save configs");
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
		const initial: Record<string, string | boolean> = {};
		for (const def of CONFIG_DEFINITIONS) {
			const value = configs[def.key];
			if (def.type === "boolean") {
				initial[def.key] = value === true || value === "true";
			} else {
				initial[def.key] = value !== undefined && value !== null ? String(value) : "";
			}
		}
		setFormValues(initial);
		setError(null);
		setSuccess(false);
	}

	// Group configs by their group
	const groups = new Map<string, Array<ConfigDefinition>>();
	for (const def of CONFIG_DEFINITIONS) {
		const group = groups.get(def.group) ?? [];
		group.push(def);
		groups.set(def.group, group);
	}

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
					Configuration saved successfully!
				</div>
			)}

			{Array.from(groups.entries()).map(([groupName, defs]) => (
				<div key={groupName} style={{ marginBottom: "1.5rem" }}>
					<h4 style={{ marginBottom: "0.75rem", color: "#333" }}>{groupName}</h4>
					{defs.map(def => (
						<div key={def.key} style={{ marginBottom: "1rem" }}>
							<label
								style={{ display: "block", fontWeight: "500", marginBottom: "0.25rem" }}
								htmlFor={def.key}
							>
								{def.label}
							</label>
							<p style={{ fontSize: "0.875rem", color: "#666", margin: "0 0 0.5rem 0" }}>
								{def.description}
							</p>
							{def.type === "boolean" ? (
								<label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
									<input
										type="checkbox"
										id={def.key}
										checked={formValues[def.key] === true}
										onChange={e => handleChange(def.key, e.target.checked)}
									/>
									<span>Enabled</span>
								</label>
							) : def.type === "select" && "options" in def ? (
								<select
									id={def.key}
									value={String(formValues[def.key] ?? "")}
									onChange={e => handleChange(def.key, e.target.value)}
									style={{
										width: "100%",
										maxWidth: "400px",
										padding: "0.5rem",
										borderRadius: "4px",
										border: "1px solid #ccc",
									}}
								>
									<option value="">-- Default --</option>
									{def.options.map(opt => (
										<option key={opt} value={opt}>
											{opt}
										</option>
									))}
								</select>
							) : (
								<input
									type={def.type === "password" ? "password" : "text"}
									id={def.key}
									value={String(formValues[def.key] ?? "")}
									onChange={e => handleChange(def.key, e.target.value)}
									placeholder={def.type === "password" ? "••••••••" : ""}
									style={{
										width: "100%",
										maxWidth: "400px",
										padding: "0.5rem",
										borderRadius: "4px",
										border: "1px solid #ccc",
									}}
								/>
							)}
						</div>
					))}
				</div>
			))}

			<div style={{ display: "flex", gap: "0.5rem", marginTop: "1.5rem" }}>
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
					}}
				>
					{saving ? "Saving..." : "Save Configs"}
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
					}}
				>
					Reset
				</button>
			</div>
		</div>
	);
}

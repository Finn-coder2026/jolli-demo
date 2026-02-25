"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/** Error messages for different error codes */
const ERROR_MESSAGES: Record<string, string> = {
	email_not_allowed: "Your email is not authorized to access this application.",
	user_inactive: "Your account has been deactivated. Please contact an administrator.",
	auth_failed: "Authentication failed. Please try again.",
	missing_params: "Invalid OAuth callback. Please try again.",
};

/** Main login page component wrapped in Suspense for useSearchParams */
export default function LoginPage() {
	return (
		<Suspense fallback={<LoginLoading />}>
			<LoginContent />
		</Suspense>
	);
}

/** Loading fallback component */
function LoginLoading() {
	return (
		<div style={styles.container}>
			<div style={styles.card}>
				<h1 style={styles.title}>Jolli Manager</h1>
				<p style={styles.subtitle}>Sign in to manage your Jolli infrastructure</p>
				<div style={styles.loading}>Loading...</div>
			</div>
		</div>
	);
}

/** Login content with search params access */
function LoginContent() {
	const searchParams = useSearchParams();
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [authConfigured, setAuthConfigured] = useState<boolean | null>(null);

	// Check for error in URL params
	useEffect(() => {
		const errorCode = searchParams.get("error");
		if (errorCode) {
			setError(ERROR_MESSAGES[errorCode] || `Authentication error: ${errorCode}`);
		}
	}, [searchParams]);

	// Check if auth is configured
	useEffect(() => {
		fetch("/api/auth/login")
			.then(res => res.json())
			.then((data: { configured: boolean }) => {
				setAuthConfigured(data.configured);
			})
			.catch(() => {
				setAuthConfigured(false);
			});
	}, []);

	const handleLogin = async () => {
		try {
			setLoading(true);
			setError(null);

			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
			});

			if (!response.ok) {
				const data = (await response.json()) as { error?: string };
				throw new Error(data.error || "Failed to initiate login");
			}

			const { redirectUrl } = (await response.json()) as { redirectUrl: string };
			window.location.href = redirectUrl;
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
			setLoading(false);
		}
	};

	return (
		<div style={styles.container}>
			<div style={styles.card}>
				<h1 style={styles.title}>Jolli Manager</h1>
				<p style={styles.subtitle}>Sign in to manage your Jolli infrastructure</p>

				{error && <div style={styles.error}>{error}</div>}

				{authConfigured === false && (
					<div style={styles.warning}>
						Authentication is not configured. Please set up Google OAuth credentials to enable login.
					</div>
				)}

				{authConfigured === true && (
					<button type="button" onClick={handleLogin} disabled={loading} style={styles.button}>
						{loading ? (
							"Redirecting..."
						) : (
							<>
								<GoogleIcon />
								<span>Sign in with Google</span>
							</>
						)}
					</button>
				)}

				{authConfigured === null && <div style={styles.loading}>Loading...</div>}
			</div>
		</div>
	);
}

/** Google icon component */
function GoogleIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: 8 }}>
			<title>Google</title>
			<path
				d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
				fill="#4285F4"
			/>
			<path
				d="M9.003 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.26c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.96v2.332C2.44 15.983 5.482 18 9.003 18z"
				fill="#34A853"
			/>
			<path
				d="M3.964 10.712c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.96H.957C.347 6.175 0 7.55 0 9.002c0 1.452.348 2.827.957 4.042l3.007-2.332z"
				fill="#FBBC05"
			/>
			<path
				d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.428 0 9.002 0 5.48 0 2.44 2.017.96 4.958L3.967 7.29c.708-2.127 2.692-3.71 5.036-3.71z"
				fill="#EA4335"
			/>
		</svg>
	);
}

/** Inline styles */
const styles: Record<string, React.CSSProperties> = {
	container: {
		minHeight: "100vh",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#f5f5f5",
		padding: 20,
	},
	card: {
		backgroundColor: "white",
		borderRadius: 8,
		padding: 40,
		boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
		maxWidth: 400,
		width: "100%",
		textAlign: "center",
	},
	title: {
		margin: 0,
		marginBottom: 8,
		fontSize: 24,
		fontWeight: 600,
		color: "#1a1a1a",
	},
	subtitle: {
		margin: 0,
		marginBottom: 24,
		fontSize: 14,
		color: "#666",
	},
	error: {
		backgroundColor: "#fee2e2",
		color: "#dc2626",
		padding: 12,
		borderRadius: 6,
		marginBottom: 16,
		fontSize: 14,
	},
	warning: {
		backgroundColor: "#fef3c7",
		color: "#d97706",
		padding: 12,
		borderRadius: 6,
		marginBottom: 16,
		fontSize: 14,
	},
	button: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		width: "100%",
		padding: "12px 24px",
		fontSize: 14,
		fontWeight: 500,
		color: "#374151",
		backgroundColor: "white",
		border: "1px solid #d1d5db",
		borderRadius: 6,
		cursor: "pointer",
		transition: "background-color 0.2s",
	},
	loading: {
		color: "#666",
		fontSize: 14,
	},
};

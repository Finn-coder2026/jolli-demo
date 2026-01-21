import { cleanUrlParams, getUrlParam } from "../common/UrlUtils";
import { useClient } from "../contexts/ClientContext";
import styles from "./AuthElement.module.css";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { useIntlayer } from "react-intlayer";

interface AuthProps {
	doLogin(): void;
}

export function AuthElement({ doLogin }: AuthProps): ReactElement {
	const client = useClient();
	const content = useIntlayer("auth");
	const [emails, setEmails] = useState<Array<string> | undefined>(undefined);
	const [loginError, setLoginError] = useState(false);
	const [enabledProviders, setEnabledProviders] = useState<Array<string> | undefined>(undefined);

	const buttonsRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const error = getUrlParam("error");
		const selectEmail = getUrlParam("select_email");
		const cliCallback = getUrlParam("cli_callback");

		if (cliCallback) {
			sessionStorage.setItem("cli_callback", cliCallback);
		}

		if (error) {
			console.error("OAuth error:", error);
			setLoginError(true);
			cleanUrlParams();
		} else if (selectEmail === "true") {
			loadEmails().then();
			cleanUrlParams();
		}

		// Fetch enabled auth providers from session config
		loadEnabledProviders().then();
	}, []);

	async function loadEnabledProviders(): Promise<void> {
		try {
			const sessionConfig = await client.auth().getSessionConfig();
			setEnabledProviders(sessionConfig.enabledProviders);
		} catch (_error) {
			// Fall back to default providers if session config fails
			setEnabledProviders(["github", "google"]);
		}
	}

	useEffect(() => {
		if (buttonsRef.current && !emails && enabledProviders) {
			buttonsRef.current.innerHTML = "";

			for (const provider of enabledProviders) {
				// Only render providers we have icons/names for
				if (!providerNames[provider] || !providerIcons[provider]) {
					continue;
				}

				const button = document.createElement("button");
				button.innerHTML = `${providerIcons[provider]} Login with ${providerNames[provider]}`;
				button.className = styles.authButton;

				button.addEventListener("click", () => {
					window.location.href = `/connect/${provider}`;
				});

				buttonsRef.current?.appendChild(button);
			}
		}
	}, [emails, enabledProviders]);

	async function loadEmails(): Promise<void> {
		try {
			const emailList = await client.auth().getEmails();
			setEmails(emailList);
		} catch (_error) {
			setLoginError(true);
		}
	}

	async function selectEmail(email: string): Promise<void> {
		try {
			const result = await client.auth().selectEmail(email);
			if (result.redirectTo) {
				// Gateway mode - redirect to tenant to complete auth
				window.location.href = result.redirectTo;
			} else {
				// Standard mode - auth complete, refresh
				doLogin();
				setEmails(undefined);
			}
		} catch (_error) {
			setLoginError(true);
		}
	}

	if (emails) {
		return (
			<>
				<h2 className={styles.emailTitle}>{content.selectEmailTitle}</h2>
				<p className={styles.emailPrompt}>{content.selectEmailPrompt}</p>
				<div className={styles.emailList}>
					{emails.map(email => (
						<button key={email} onClick={() => selectEmail(email)} className={styles.emailButton}>
							{email}
						</button>
					))}
				</div>
				{loginError && <p className={styles.errorMessage}>{content.selectEmailError}</p>}
			</>
		);
	}

	return (
		<>
			<div ref={buttonsRef} className={styles.buttonsContainer} />
			{loginError && <p className={styles.errorMessage}>{content.loginError}</p>}
		</>
	);
}

const providerNames: Record<string, string> = {
	github: "GitHub",
	google: "Google",
};

const providerIcons: Record<string, string> = {
	github: `<svg style="width: 18px; height: 18px; margin-right: 8px;" viewBox="0 0 24 24" fill="white">
		<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
	</svg>`,
	google: `<svg style="width: 18px; height: 18px; margin-right: 8px;" viewBox="0 0 24 24" fill="white">
		<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
		<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
		<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
		<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
	</svg>`,
};

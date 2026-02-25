import styles from "./LandingPage.module.css";
import { type ReactElement, useState } from "react";
import { useIntlayer } from "react-intlayer";

interface LandingPageProps {
	isLoggedIn?: boolean;
	authGatewayOrigin?: string | undefined;
	/** Callback to enter the app; uses router navigate to respect path-based tenant prefix */
	onEnterApp?: () => void;
}

export function LandingPage({ isLoggedIn = false, authGatewayOrigin, onEnterApp }: LandingPageProps): ReactElement {
	const content = useIntlayer("landingPage");
	const [imageSrc, setImageSrc] = useState("/assets/jolli-coming-soon.avif");

	function handleSignIn(): void {
		window.location.href = authGatewayOrigin ? `${authGatewayOrigin}/login` : "/login";
	}

	function handleEnterApp(): void {
		if (onEnterApp) {
			onEnterApp();
		} else {
			window.location.href = "/dashboard";
		}
	}

	function handleImageError(): void {
		setImageSrc(current =>
			current === "/assets/jolli-coming-soon.png" ? current : "/assets/jolli-coming-soon.png",
		);
	}

	return (
		<div className={styles.container}>
			<header className={styles.header}>
				<div className={styles.headerContent}>
					<div className={styles.logo}>
						<div className={styles.logoIcon}>📝</div>
						<span className={styles.logoText}>Jolli</span>
					</div>
					{isLoggedIn ? (
						<button type="button" onClick={handleEnterApp} className={styles.signInButton}>
							{content.enterApp}
						</button>
					) : (
						<button type="button" onClick={handleSignIn} className={styles.signInButton}>
							{content.signIn}
						</button>
					)}
				</div>
			</header>

			<main className={styles.main}>
				<img
					src={imageSrc}
					alt={content.comingSoonAlt.value}
					className={styles.comingSoonImage}
					data-testid="coming-soon-image"
					onError={handleImageError}
				/>
			</main>
		</div>
	);
}

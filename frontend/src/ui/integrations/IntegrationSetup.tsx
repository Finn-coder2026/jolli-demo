import { useClient } from "../../contexts/ClientContext";
import { SuccessScreen } from "./components/SuccessScreen";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { GitHubIntegrationFlow } from "./github/GitHubIntegrationFlow";
import { StaticFileIntegrationFlow } from "./staticfile/StaticFileIntegrationFlow";
import type { IntegrationSetupProps, IntegrationType } from "./types";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useIntlayer } from "react-intlayer";

type SetupStep = "welcome" | "integration-flow" | "success";

export function IntegrationSetup({ onComplete, initialSuccess }: IntegrationSetupProps): ReactElement {
	const [step, setStep] = useState<SetupStep>(initialSuccess ? "success" : "welcome");
	const [selectedIntegrationType, setSelectedIntegrationType] = useState<IntegrationType>("github");
	const [hasExistingIntegrations, setHasExistingIntegrations] = useState(false);
	const content = useIntlayer("integration-setup");

	const client = useClient();

	// Check for existing integrations on mount
	useEffect(() => {
		async function checkExistingIntegrations() {
			try {
				const integrations = await client.integrations().listIntegrations();
				setHasExistingIntegrations(integrations.length > 0);
			} catch (_err) {
				// If we can't fetch integrations, assume this is the first one
				setHasExistingIntegrations(false);
			}
		}
		checkExistingIntegrations().then();
	}, [client]);

	// Update step when initialSuccess changes
	useEffect(() => {
		if (initialSuccess) {
			setStep("success");
		}
	}, [initialSuccess]);

	const handleSelectType = (type: IntegrationType) => {
		setSelectedIntegrationType(type);
		setStep("integration-flow");
	};

	const handleSkip = () => {
		onComplete();
	};

	/* c8 ignore next 3 */
	const handleIntegrationComplete = () => {
		setStep("success");
	};

	/* c8 ignore next 3 */
	const handleCancel = () => {
		setStep("welcome");
	};

	const handleFinish = () => {
		onComplete();
	};

	if (step === "welcome") {
		return (
			<WelcomeScreen
				hasExistingIntegrations={hasExistingIntegrations}
				onSelectType={handleSelectType}
				onSkip={handleSkip}
			/>
		);
	}

	if (step === "integration-flow") {
		/* c8 ignore next 4 */
		if (selectedIntegrationType === "github") {
			return <GitHubIntegrationFlow onComplete={handleIntegrationComplete} onCancel={handleCancel} />;
		}
		/* c8 ignore next 4 */
		if (selectedIntegrationType === "static_file") {
			return <StaticFileIntegrationFlow onComplete={handleIntegrationComplete} onCancel={handleCancel} />;
		}

		/* v8 ignore next 2 -- placeholder for future integration types */
		return <div>{content.notSupported}</div>;
	}

	/* c8 ignore next 7 */
	if (step === "success") {
		return <SuccessScreen onFinish={handleFinish} />;
	}

	// Exhaustive check - TypeScript ensures all step values are handled above
	return step;
}

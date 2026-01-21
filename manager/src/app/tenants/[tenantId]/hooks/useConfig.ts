import { useEffect, useState } from "react";

export function useConfig() {
	const [allowHardDelete, setAllowHardDelete] = useState(false);
	const [gatewayDomain, setGatewayDomain] = useState("jolli.app");

	useEffect(() => {
		async function loadConfig() {
			try {
				const response = await fetch("/api/config");
				if (response.ok) {
					const config = await response.json();
					setAllowHardDelete(config.allowHardDelete);
					if (config.gatewayDomain) {
						setGatewayDomain(config.gatewayDomain);
					}
				}
			} catch {
				// Ignore errors - will default to false/jolli.app
			}
		}
		loadConfig();
	}, []);

	return { allowHardDelete, gatewayDomain };
}

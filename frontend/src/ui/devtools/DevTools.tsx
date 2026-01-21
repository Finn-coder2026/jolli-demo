import { useDevTools } from "../../contexts/DevToolsContext";
import { ConfigReloader } from "./ConfigReloader";
import { DataClearer } from "./DataClearer";
import { DemoJobsTester } from "./DemoJobsTester";
import { DraftGenerator } from "./DraftGenerator";
import { GitHubAppCreator } from "./GitHubAppCreator";
import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export function DevTools(): ReactElement {
	const content = useIntlayer("devtools");
	const { githubAppCreatorEnabled, jobTesterEnabled, dataClearerEnabled, draftGeneratorEnabled } = useDevTools();

	return (
		<div className="bg-card rounded-lg p-6 border h-full">
			<div className="mb-6">
				<h1 className="font-semibold" style={{ fontSize: "2rem", margin: "0 0 8px" }}>
					{content.title}
				</h1>
				<p className="text-sm m-0" style={{ color: "#808080cc" }}>
					{content.subtitle}
				</p>
			</div>
			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				{githubAppCreatorEnabled && <GitHubAppCreator />}
				{jobTesterEnabled && <DemoJobsTester />}
				{dataClearerEnabled && <DataClearer />}
				{draftGeneratorEnabled && <DraftGenerator />}
				<ConfigReloader />
			</div>
		</div>
	);
}

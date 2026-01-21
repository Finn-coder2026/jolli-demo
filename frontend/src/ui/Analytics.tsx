import type { ReactElement } from "react";
import { useIntlayer } from "react-intlayer";

export function Analytics(): ReactElement {
	const content = useIntlayer("analytics");

	return (
		<div className="bg-card rounded-lg p-6 border h-full">
			<div className="mb-6">
				<h1
					className="font-semibold"
					style={{ fontSize: "2rem", margin: "0 0 8px" }}
					data-testid="analytics-title"
				>
					{content.title}
				</h1>
				<p className="text-sm m-0" style={{ color: "#808080cc" }} data-testid="analytics-subtitle">
					{content.subtitle}
				</p>
			</div>
			<div>{/* Analytics content will go here */}</div>
		</div>
	);
}

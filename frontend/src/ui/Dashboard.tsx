import { useLocation } from "../contexts/RouterContext";
import { JobsRunningList } from "./dashboard/components/JobsRunningList";
import { JobsStatsCard } from "./dashboard/components/JobsStatsCard";
import { SuggestedUpdatesCard } from "./dashboard/components/SuggestedUpdatesCard";
import { ActiveJobs } from "./jobs/ActiveJobs";
import { JobHistory } from "./jobs/JobHistory";
import type { ReactElement } from "react";
import { useMemo } from "react";
import { useIntlayer } from "react-intlayer";

export function Dashboard(): ReactElement {
	const location = useLocation();
	const content = useIntlayer("dashboard");

	// Parse the pathname to check for job sub-routes
	const pathSegments = useMemo(() => {
		return location.pathname.split("/").filter(Boolean);
	}, [location.pathname]);

	// Check if we're viewing a job sub-route
	if (pathSegments[0] === "jobs") {
		if (pathSegments[1] === "active") {
			return <ActiveJobs />;
		}
		if (pathSegments[1] === "history") {
			return <JobHistory />;
		}
	}

	// Default dashboard view
	return (
		<div className="p-6 h-full overflow-auto scrollbar-thin">
			<div className="mb-6">
				<h1 className="font-semibold" style={{ fontSize: "2rem", margin: "0 0 8px" }}>
					{content.title}
				</h1>
				<p className="text-sm m-0" style={{ color: "#808080cc" }}>
					{content.subtitle}
				</p>
			</div>
			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				<JobsStatsCard />
				<div className="lg:col-span-2">
					<JobsRunningList />
				</div>
				<div className="lg:col-span-3">
					<SuggestedUpdatesCard />
				</div>
			</div>
		</div>
	);
}

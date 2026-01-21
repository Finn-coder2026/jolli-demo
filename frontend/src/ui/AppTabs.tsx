import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/Tabs";
import type { ReactElement } from "react";

interface TabContent {
	key: string;
	label: string;
	children: ReactElement;
}

interface AppTabsProps {
	tabs: Array<TabContent>;
	defaultActiveKey?: string;
}

export function AppTabs({ tabs, defaultActiveKey }: AppTabsProps): ReactElement {
	return (
		<Tabs defaultValue={defaultActiveKey || tabs[0]?.key}>
			<TabsList>
				{tabs.map(tab => (
					<TabsTrigger key={tab.key} value={tab.key}>
						{tab.label}
					</TabsTrigger>
				))}
			</TabsList>
			{tabs.map(tab => (
				<TabsContent key={tab.key} value={tab.key}>
					{tab.children}
				</TabsContent>
			))}
		</Tabs>
	);
}

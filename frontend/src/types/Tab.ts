import type { LucideIcon } from "lucide-react";

export interface Tab<TabName extends string> {
	name: TabName;
	icon: LucideIcon;
	label: string;
	badge?: string;
}

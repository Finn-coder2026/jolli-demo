import type React from "react";

export interface ViewDefinition {
	name: string;
	component: () => React.ReactElement;
}

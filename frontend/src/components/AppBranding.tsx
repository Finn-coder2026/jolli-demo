import type { ReactElement } from "react";

interface AppBrandingProps {
	variant?: "centered" | "sidebar";
	showText?: boolean;
	animate?: boolean;
}

export function AppBranding({
	variant = "centered",
	showText = true,
	animate = false,
}: AppBrandingProps): ReactElement {
	if (variant === "centered") {
		return (
			<div className="mb-8 text-center">
				<div className="mb-4 flex justify-center">
					<div className="flex h-16 w-16 items-center justify-center rounded-md bg-[#5b7ee5] text-4xl">
						📄
					</div>
				</div>
				{showText && (
					<>
						<h1 className="mb-2 text-3xl font-bold">Jolli</h1>
						<p className="text-muted-foreground">Documentation Intelligence</p>
					</>
				)}
			</div>
		);
	}

	// sidebar variant
	return (
		<div className="flex h-16 items-center gap-3 border-b px-4">
			<div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-[#5b7ee5] text-base">
				📄
			</div>
			{showText && (
				<div className={`flex flex-col gap-0.5 ${animate ? "animate-in fade-in duration-600" : ""}`}>
					<div className="text-sm font-semibold leading-none">Jolli</div>
					<div className="text-xs text-muted-foreground leading-none">Documentation Intelligence</div>
				</div>
			)}
		</div>
	);
}

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
	title: "Jolli Manager",
	description: "Tenant and system management for Jolli",
};

interface RootLayoutProps {
	children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}

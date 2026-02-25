import type { Metadata } from "next";
import type { ReactNode } from "react";
import { MainLayout } from "@/components/MainLayout";
import { AuthProvider } from "@/contexts/AuthContext";

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
			<head>
				<style>{`
					@keyframes spin {
						from { transform: rotate(0deg); }
						to { transform: rotate(360deg); }
					}
					* {
						margin: 0;
						padding: 0;
						box-sizing: border-box;
					}
					body {
						font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
						-webkit-font-smoothing: antialiased;
						-moz-osx-font-smoothing: grayscale;
					}
				`}</style>
			</head>
			<body>
				<AuthProvider>
					<MainLayout>{children}</MainLayout>
				</AuthProvider>
			</body>
		</html>
	);
}

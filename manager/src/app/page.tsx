import Link from "next/link";

export default function DashboardPage() {
	return (
		<main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
			<h1>Jolli Manager</h1>
			<p>Tenant provisioning and management dashboard</p>

			<nav style={{ marginTop: "2rem" }}>
				<ul style={{ listStyle: "none", padding: 0 }}>
					<li style={{ marginBottom: "1rem" }}>
						<Link href="/tenants">Tenants</Link>
						<span style={{ color: "#666", marginLeft: "0.5rem" }}>- Manage tenant instances</span>
					</li>
					<li style={{ marginBottom: "1rem" }}>
						<Link href="/providers">Database Providers</Link>
						<span style={{ color: "#666", marginLeft: "0.5rem" }}>- Configure database providers</span>
					</li>
				</ul>
			</nav>
		</main>
	);
}

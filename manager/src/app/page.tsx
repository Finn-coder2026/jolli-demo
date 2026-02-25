import { redirect } from "next/navigation";

export default function HomePage() {
	// Redirect to tenants page as the default landing page
	redirect("/tenants");
}

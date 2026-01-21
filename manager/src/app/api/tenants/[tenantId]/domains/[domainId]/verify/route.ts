import { getDatabase } from "../../../../../../../lib/db/getDatabase";
import { createDomainVerificationService } from "../../../../../../../lib/services/DomainVerificationService";
import { NextResponse } from "next/server";

interface RouteParams {
	params: Promise<{ tenantId: string; domainId: string }>;
}

/**
 * POST /api/tenants/[tenantId]/domains/[domainId]/verify - Verify domain ownership
 *
 * Checks the DNS TXT record for the verification token and marks the domain
 * as verified if found.
 */
export async function POST(_request: Request, { params }: RouteParams) {
	try {
		const { tenantId, domainId } = await params;
		const db = await getDatabase();

		// Check if tenant exists
		const tenant = await db.tenantDao.getTenant(tenantId);
		if (!tenant) {
			return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
		}

		const domain = await db.domainDao.getDomain(domainId);
		if (!domain) {
			return NextResponse.json({ error: "Domain not found" }, { status: 404 });
		}

		// Verify domain belongs to this tenant
		if (domain.tenantId !== tenantId) {
			return NextResponse.json({ error: "Domain not found" }, { status: 404 });
		}

		// Check if already verified
		if (domain.verifiedAt) {
			return NextResponse.json({
				verified: true,
				message: "Domain is already verified",
				verifiedAt: domain.verifiedAt,
			});
		}

		// Need verification token
		if (!domain.verificationToken) {
			return NextResponse.json({ error: "Domain has no verification token" }, { status: 400 });
		}

		// Verify the domain
		const verificationService = createDomainVerificationService();
		const result = await verificationService.verifyDomain(domain.domain, domain.verificationToken);

		if (result.verified) {
			// Mark domain as verified
			await db.domainDao.markVerified(domainId);

			// TODO: Provision SSL via provider
			// const sslProvider = getSslProvider();
			// const sslResult = await sslProvider.addDomain(domain.domain);
			// if (sslResult.success) {
			//   await db.domainDao.updateSslStatus(domainId, 'active');
			// }

			return NextResponse.json({
				verified: true,
				message: "Domain verified successfully",
			});
		}

		return NextResponse.json({
			verified: false,
			error: result.error,
			expectedRecord: result.expectedRecord,
			foundRecords: result.foundRecords,
			instructions: verificationService.getVerificationInstructions(domain.domain, domain.verificationToken),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

import {
	getOAuthNotificationEmailContent,
	getPasswordResetEmailContent,
	getSecurityAlertEmailContent,
	securityAlertEmailContent,
} from "./EmailContent";
import { describe, expect, it } from "vitest";

describe("EmailContent", () => {
	describe("getPasswordResetEmailContent", () => {
		it("should return English content by default", () => {
			const content = getPasswordResetEmailContent("en");

			expect(content.subject).toBe("Reset Your Password - Jolli");
			expect(content.title).toBe("Reset Your Password");
			expect(content.buttonText).toBe("Reset Password");
		});

		it("should return Spanish content when locale is es", () => {
			const content = getPasswordResetEmailContent("es");

			expect(content.subject).toBe("Restablece tu Contraseña - Jolli");
			expect(content.title).toBe("Restablece tu Contraseña");
			expect(content.buttonText).toBe("Restablecer Contraseña");
		});

		it("should have greeting function that includes user name", () => {
			const content = getPasswordResetEmailContent("en");

			expect(content.greeting("John")).toBe("Hi John,");
		});
	});

	describe("getOAuthNotificationEmailContent", () => {
		it("should return English content by default", () => {
			const content = getOAuthNotificationEmailContent("en");

			expect(content.subject).toBe("About Your Account Login - Jolli");
			expect(content.title).toBe("About Your Account Login");
			expect(content.buttonText).toBe("Go to Login Page");
		});

		it("should return Spanish content when locale is es", () => {
			const content = getOAuthNotificationEmailContent("es");

			expect(content.subject).toBe("Acerca del Inicio de Sesión de tu Cuenta - Jolli");
			expect(content.title).toBe("Acerca del Inicio de Sesión de tu Cuenta");
			expect(content.buttonText).toBe("Ir a la Página de Inicio de Sesión");
		});
	});

	describe("getSecurityAlertEmailContent", () => {
		it("should return English content by default", () => {
			const content = getSecurityAlertEmailContent("en");

			expect(content.subject).toBe("Security Alert - Suspicious Activity Detected - Jolli");
			expect(content.title).toBe("Security Alert");
			expect(content.buttonText).toBe("Review Account Security");
			expect(content.recommendationsTitle).toBe("We recommend:");
		});

		it("should return Spanish content when locale is es", () => {
			const content = getSecurityAlertEmailContent("es");

			expect(content.subject).toBe("Alerta de Seguridad - Actividad Sospechosa Detectada - Jolli");
			expect(content.title).toBe("Alerta de Seguridad");
			expect(content.buttonText).toBe("Revisar Seguridad de la Cuenta");
			expect(content.recommendationsTitle).toBe("Te recomendamos:");
		});

		it("should have greeting function that includes user name", () => {
			const content = getSecurityAlertEmailContent("en");

			expect(content.greeting("John")).toBe("Hi John,");
		});

		it("should have greeting function that includes user name in Spanish", () => {
			const content = getSecurityAlertEmailContent("es");

			expect(content.greeting("Juan")).toBe("Hola Juan,");
		});

		it("should have recommendations array with security tips", () => {
			const content = getSecurityAlertEmailContent("en");

			expect(content.recommendations).toBeInstanceOf(Array);
			expect(content.recommendations.length).toBe(3);
			expect(content.recommendations[0]).toContain("password");
		});

		it("should have recommendations array in Spanish", () => {
			const content = getSecurityAlertEmailContent("es");

			expect(content.recommendations).toBeInstanceOf(Array);
			expect(content.recommendations.length).toBe(3);
			expect(content.recommendations[0]).toContain("contraseña");
		});

		it("should have theft detected message", () => {
			const content = getSecurityAlertEmailContent("en");

			expect(content.theftDetected).toContain("login token");
			expect(content.theftDetected).toContain("invalid signature");
		});

		it("should have action taken message", () => {
			const content = getSecurityAlertEmailContent("en");

			expect(content.actionTaken).toContain("signed you out");
		});

		it("should have details title", () => {
			const content = getSecurityAlertEmailContent("en");

			expect(content.detailsTitle).toBe("Details:");
		});

		it("should have security notice", () => {
			const content = getSecurityAlertEmailContent("en");

			expect(content.securityNotice).toContain("recognize this activity");
		});
	});

	describe("securityAlertEmailContent structure", () => {
		it("should have both en and es locales", () => {
			expect(securityAlertEmailContent.en).toBeDefined();
			expect(securityAlertEmailContent.es).toBeDefined();
		});

		it("should have all required fields in en locale", () => {
			const en = securityAlertEmailContent.en;

			expect(en.subject).toBeDefined();
			expect(en.title).toBeDefined();
			expect(en.greeting).toBeDefined();
			expect(en.intro).toBeDefined();
			expect(en.theftDetected).toBeDefined();
			expect(en.actionTaken).toBeDefined();
			expect(en.recommendations).toBeDefined();
			expect(en.recommendationsTitle).toBeDefined();
			expect(en.buttonText).toBeDefined();
			expect(en.detailsTitle).toBeDefined();
			expect(en.securityNotice).toBeDefined();
			expect(en.closing).toBeDefined();
		});

		it("should have all required fields in es locale", () => {
			const es = securityAlertEmailContent.es;

			expect(es.subject).toBeDefined();
			expect(es.title).toBeDefined();
			expect(es.greeting).toBeDefined();
			expect(es.intro).toBeDefined();
			expect(es.theftDetected).toBeDefined();
			expect(es.actionTaken).toBeDefined();
			expect(es.recommendations).toBeDefined();
			expect(es.recommendationsTitle).toBeDefined();
			expect(es.buttonText).toBeDefined();
			expect(es.detailsTitle).toBeDefined();
			expect(es.securityNotice).toBeDefined();
			expect(es.closing).toBeDefined();
		});
	});
});

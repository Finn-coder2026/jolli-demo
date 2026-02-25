import { type Dictionary, t } from "intlayer";

/**
 * Localization content for tenant selector UI
 */
const tenantSelectorContent = {
	key: "tenantSelector",
	content: {
		selectTenantTitle: t({
			en: "Select Organization",
			es: "Seleccionar organización",
		}),
		selectTenantSubtitle: t({
			en: "Choose an organization to continue",
			es: "Elige una organización para continuar",
		}),
		loading: t({
			en: "Loading organizations...",
			es: "Cargando organizaciones...",
		}),
		fetchError: t({
			en: "Failed to load organizations. Please try again.",
			es: "Error al cargar organizaciones. Inténtalo de nuevo.",
		}),
		emailNotAuthorizedError: t({
			en: "Your email is not authorized for this organization. Please contact your administrator.",
			es: "Tu correo no está autorizado para esta organización. Contacta a tu administrador.",
		}),
		noTenantsTitle: t({
			en: "No Organizations",
			es: "Sin organizaciones",
		}),
		noTenantsMessage: t({
			en: "You are not a member of any organizations yet. Please contact your administrator to be invited to an organization or request access.",
			es: "Aún no eres miembro de ninguna organización. Contacta a tu administrador para ser invitado a una organización o solicitar acceso.",
		}),
		default: t({
			en: "Default",
			es: "Predeterminado",
		}),
		lastUsed: t({
			en: "Last used",
			es: "Último usado",
		}),
		roleLabel: t({
			en: "Role",
			es: "Rol",
		}),
		orgLabel: t({
			en: "Organization",
			es: "Organización",
		}),
		loginWithAnotherAccount: t({
			en: "Sign in with a different account",
			es: "Iniciar sesión con otra cuenta",
		}),
		signingOut: t({
			en: "Signing out...",
			es: "Cerrando sesión...",
		}),
	},
} satisfies Dictionary;

export default tenantSelectorContent;

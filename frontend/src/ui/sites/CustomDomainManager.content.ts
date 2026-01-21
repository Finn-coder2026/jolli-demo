import { type Dictionary, t } from "intlayer";

const customDomainManagerContent = {
	key: "custom-domain-manager",
	content: {
		title: t({
			en: "Custom Domain",
			es: "Dominio Personalizado",
		}),
		addDomain: t({
			en: "Add",
			es: "Agregar",
		}),
		addDomainTitle: t({
			en: "Connect Your Domain",
			es: "Conecta Tu Dominio",
		}),
		addDomainDescription: t({
			en: "Enter a domain you own (e.g., docs.yourcompany.com). We'll guide you through the DNS setup.",
			es: "Ingresa un dominio que poseas (ej., docs.tuempresa.com). Te guiaremos con la configuración DNS.",
		}),
		domainPlaceholder: t({
			en: "docs.yourcompany.com",
			es: "docs.tuempresa.com",
		}),
		add: t({
			en: "Continue",
			es: "Continuar",
		}),
		adding: t({
			en: "Adding...",
			es: "Agregando...",
		}),
		cancel: t({
			en: "Cancel",
			es: "Cancelar",
		}),
		remove: t({
			en: "Remove",
			es: "Eliminar",
		}),
		noDomains: t({
			en: "Point your own domain to this site for a branded experience.",
			es: "Apunta tu propio dominio a este sitio para una experiencia personalizada.",
		}),
		checkStatus: t({
			en: "Verify",
			es: "Verificar",
		}),
		refreshAll: t({
			en: "Refresh",
			es: "Actualizar",
		}),
		lastChecked: t({
			en: "Last checked",
			es: "Última verificación",
		}),
		confirmRemove: t({
			en: "Remove this domain? Your site will only be accessible via the default URL.",
			es: "¿Eliminar este dominio? Tu sitio solo será accesible a través de la URL predeterminada.",
		}),
		invalidDomain: t({
			en: "Enter a valid domain (e.g., docs.example.com)",
			es: "Ingresa un dominio válido (ej., docs.ejemplo.com)",
		}),
		addFailed: t({
			en: "Couldn't add domain. Please try again.",
			es: "No se pudo agregar el dominio. Intenta de nuevo.",
		}),
		removeFailed: t({
			en: "Couldn't remove domain. Please try again.",
			es: "No se pudo eliminar el dominio. Intenta de nuevo.",
		}),
		verifyFailed: t({
			en: "Verification failed. Check your DNS settings and try again.",
			es: "La verificación falló. Verifica tu configuración DNS e intenta de nuevo.",
		}),
		refreshFailed: t({
			en: "Couldn't refresh status. Please try again.",
			es: "No se pudo actualizar el estado. Intenta de nuevo.",
		}),
		recordType: t({
			en: "Record Type",
			es: "Tipo de Registro",
		}),
		recordName: t({
			en: "Host / Name",
			es: "Host / Nombre",
		}),
		recordValue: t({
			en: "Points to / Value",
			es: "Apunta a / Valor",
		}),
		pendingStatus: t({
			en: "Awaiting DNS",
			es: "Esperando DNS",
		}),
		verifiedStatus: t({
			en: "Connected",
			es: "Conectado",
		}),
		failedStatus: t({
			en: "Check DNS",
			es: "Verificar DNS",
		}),
		autoChecking: t({
			en: "Auto-checking...",
			es: "Verificando automáticamente...",
		}),
		step1Title: t({
			en: "Step 1: Point your domain to our servers",
			es: "Paso 1: Apunta tu dominio a nuestros servidores",
		}),
		step1Description: t({
			en: "Add this record to route traffic to your site.",
			es: "Agrega este registro para dirigir el tráfico a tu sitio.",
		}),
		step2Title: t({
			en: "Step 2: Verify domain ownership",
			es: "Paso 2: Verifica la propiedad del dominio",
		}),
		step2Description: t({
			en: "Add this record to prove you own the domain.",
			es: "Agrega este registro para demostrar que eres dueño del dominio.",
		}),
		waitingForVerification: t({
			en: "After adding the record above, click Verify to continue.",
			es: "Después de agregar el registro anterior, haz clic en Verificar para continuar.",
		}),
	},
} satisfies Dictionary;

export default customDomainManagerContent;

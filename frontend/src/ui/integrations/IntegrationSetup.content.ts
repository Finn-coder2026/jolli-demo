import { type Dictionary, t } from "intlayer";

const integrationSetupContent = {
	key: "integration-setup",
	content: {
		// IntegrationSetup
		notSupported: t({ en: "Integration type not yet supported", es: "Tipo de integración aún no soportado" }),

		// WelcomeScreen
		welcomeTitle: t({ en: "Welcome to Jolli!", es: "¡Bienvenido a Jolli!" }),
		addIntegrationTitle: t({ en: "Add a Source", es: "Agregar una Fuente" }),
		welcomeMessage: t({
			en: "Choose a source type to connect. This allows Jolli to index your content and provide intelligent assistance.",
			es: "Elija un tipo de fuente para conectar. Esto permite a Jolli indexar su contenido y proporcionar asistencia inteligente.",
		}),
		addIntegrationMessage: t({
			en: "Choose another source to help Jolli increase its understanding of your software product.",
			es: "Elija otra fuente para ayudar a Jolli a aumentar su comprensión de su producto de software.",
		}),
		skipForNow: t({ en: "Skip for now", es: "Omitir por ahora" }),

		// Integration type options
		githubOption: t({ en: "GitHub", es: "GitHub" }),
		githubDescription: t({ en: "Connect a repository", es: "Conectar un repositorio" }),
		staticFileOption: t({ en: "Static Files", es: "Archivos Estáticos" }),
		staticFileDescription: t({ en: "Upload documents directly", es: "Subir documentos directamente" }),

		// SuccessScreen
		successTitle: t({ en: "All Set!", es: "¡Todo Listo!" }),
		successMessage: t({
			en: "Your source has been successfully connected. Jolli will now index your content and be ready to help you.",
			es: "Su fuente ha sido conectada exitosamente. Jolli ahora indexará su contenido y estará listo para ayudarle.",
		}),
		goToDashboard: t({ en: "Go to Dashboard", es: "Ir al Panel" }),
	},
} satisfies Dictionary;

export default integrationSetupContent;

import { type Dictionary, t } from "intlayer";

const onboardingContent = {
	key: "onboarding",
	content: {
		// Page title and subtitle
		title: t({
			en: "Welcome to Jolli",
			es: "Bienvenido a Jolli",
		}),
		subtitle: t({
			en: "Let's get you set up with your documentation",
			es: "Vamos a configurar tu documentacion",
		}),

		// Chat placeholder
		chatPlaceholder: t({
			en: "Type your message...",
			es: "Escribe tu mensaje...",
		}),

		// Chat input label
		chatInputLabel: t({
			en: "Chat with Jolli",
			es: "Chatea con Jolli",
		}),

		// Send button
		send: t({
			en: "Send",
			es: "Enviar",
		}),

		// Skip button
		skip: t({
			en: "Skip for now",
			es: "Saltar por ahora",
		}),

		// Skip confirmation
		skipConfirmTitle: t({
			en: "Skip onboarding?",
			es: "Saltar la configuracion?",
		}),
		skipConfirmMessage: t({
			en: "You can always set up integrations later from Settings.",
			es: "Siempre puedes configurar las integraciones mas tarde desde Configuracion.",
		}),
		skipConfirmYes: t({
			en: "Yes, skip",
			es: "Si, saltar",
		}),
		skipConfirmNo: t({
			en: "Continue setup",
			es: "Continuar configuracion",
		}),

		// Loading states
		loading: t({
			en: "Loading...",
			es: "Cargando...",
		}),
		thinking: t({
			en: "Thinking...",
			es: "Pensando...",
		}),

		// Tool call labels
		toolCallPrefix: t({
			en: "Running:",
			es: "Ejecutando:",
		}),

		// Tool names (user-friendly)
		toolConnectGithub: t({
			en: "Connect GitHub",
			es: "Conectar GitHub",
		}),
		toolListRepos: t({
			en: "List Repositories",
			es: "Listar Repositorios",
		}),
		toolScanRepository: t({
			en: "Scan Repository",
			es: "Escanear Repositorio",
		}),
		toolImportMarkdown: t({
			en: "Import Markdown",
			es: "Importar Markdown",
		}),
		toolGenerateArticle: t({
			en: "Generate Article",
			es: "Generar Articulo",
		}),
		toolAdvanceStep: t({
			en: "Advance Step",
			es: "Avanzar Paso",
		}),
		toolSkipOnboarding: t({
			en: "Skip Onboarding",
			es: "Saltar Configuracion",
		}),
		toolCompleteOnboarding: t({
			en: "Complete Onboarding",
			es: "Completar Configuracion",
		}),
		toolCheckGithubStatus: t({
			en: "Check GitHub Status",
			es: "Verificar estado de GitHub",
		}),
		toolInstallGithubApp: t({
			en: "Install GitHub App",
			es: "Instalar aplicacion de GitHub",
		}),
		toolConnectGithubRepo: t({
			en: "Connect Repository",
			es: "Conectar repositorio",
		}),
		toolGetOrCreateSpace: t({
			en: "Create Space",
			es: "Crear espacio",
		}),
		toolImportAllMarkdown: t({
			en: "Import All Documents",
			es: "Importar todos los documentos",
		}),
		toolGapAnalysis: t({
			en: "Analyzing Documentation Gaps",
			es: "Analizando brechas de documentacion",
		}),
		toolGenerateFromCode: t({
			en: "Generating Documentation",
			es: "Generando documentacion",
		}),
		toolCheckSyncTriggered: t({
			en: "Check Sync Status",
			es: "Verificar estado de sincronizacion",
		}),

		// Dialog controls
		closeDialog: t({
			en: "Close",
			es: "Cerrar",
		}),
		minimizePanel: t({
			en: "Minimize",
			es: "Minimizar",
		}),
		expandPanel: t({
			en: "Expand",
			es: "Expandir",
		}),
		dragToMove: t({
			en: "Drag to move",
			es: "Arrastra para mover",
		}),

		// Jobs panel
		jobsPanelTitle: t({
			en: "Jobs",
			es: "Tareas",
		}),
		jobsRunning: t({
			en: "running",
			es: "ejecutando",
		}),
		jobsQueued: t({
			en: "queued",
			es: "en cola",
		}),
		jobStatusRunning: t({
			en: "Running",
			es: "Ejecutando",
		}),
		jobStatusQueued: t({
			en: "Queued",
			es: "En cola",
		}),
		jobStatusCompleted: t({
			en: "Completed",
			es: "Completado",
		}),
		jobStatusFailed: t({
			en: "Failed",
			es: "Fallido",
		}),
		noJobs: t({
			en: "No jobs yet",
			es: "Sin tareas aún",
		}),

		// The 3 main onboarding jobs
		job1Title: t({
			en: "Connect GitHub",
			es: "Conectar GitHub",
		}),
		job1Pending: t({
			en: "Not connected",
			es: "No conectado",
		}),
		job1Complete: t({
			en: "Connected",
			es: "Conectado",
		}),
		job2Title: t({
			en: "Import Documents",
			es: "Importar documentos",
		}),
		job2Pending: t({
			en: "No documents imported",
			es: "No hay documentos importados",
		}),
		job2Progress: t({
			en: "imported",
			es: "importados",
		}),
		job2Complete: t({
			en: "All documents imported",
			es: "Todos los documentos importados",
		}),
		job3Title: t({
			en: "Test Auto-Sync",
			es: "Probar sincronización",
		}),
		job3Pending: t({
			en: "Not tested yet",
			es: "No probado aún",
		}),
		job3Complete: t({
			en: "Sync working",
			es: "Sincronización funcionando",
		}),

		jobConnectGitHub: t({
			en: "Connecting to GitHub",
			es: "Conectando a GitHub",
		}),
		jobGitHubConnected: t({
			en: "Repository connected",
			es: "Repositorio conectado",
		}),
		jobImportingDocument: t({
			en: "Importing document",
			es: "Importando documento",
		}),
		jobImportCompleted: t({
			en: "Import completed",
			es: "Importación completada",
		}),
		jobScanningRepository: t({
			en: "Scanning repository",
			es: "Escaneando repositorio",
		}),
		jobScanCompleted: t({
			en: "Scan completed",
			es: "Escaneo completado",
		}),
		jobFailed: t({
			en: "Failed",
			es: "Fallido",
		}),

		// Action buttons
		actionImportUrl: t({
			en: "Import from URL",
			es: "Importar desde URL",
		}),
		actionUploadFile: t({
			en: "Upload file instead",
			es: "Subir archivo en su lugar",
		}),
		actionBrowseFiles: t({
			en: "Browse files",
			es: "Explorar archivos",
		}),
		actionUseUrl: t({
			en: "Use URL instead",
			es: "Usar URL en su lugar",
		}),
		actionSkipForNow: t({
			en: "Skip for now",
			es: "Saltar por ahora",
		}),

		// Error messages
		errorGeneric: t({
			en: "Something went wrong. Please try again.",
			es: "Algo salio mal. Por favor, intentalo de nuevo.",
		}),
		errorUnauthorized: t({
			en: "Your session has expired. Please log in again.",
			es: "Tu sesion ha expirado. Por favor, inicia sesion de nuevo.",
		}),
		errorLlmNotConfigured: t({
			en: "AI assistant is not available. Please contact support.",
			es: "El asistente de IA no esta disponible. Por favor, contacta soporte.",
		}),

		// Completion message
		completionTitle: t({
			en: "You're all set!",
			es: "Estas listo!",
		}),
		completionMessage: t({
			en: "Your documentation workspace is ready. Let's start creating!",
			es: "Tu espacio de documentacion esta listo. Empecemos a crear!",
		}),
		goToArticles: t({
			en: "Go to Articles",
			es: "Ir a Articulos",
		}),
	},
} satisfies Dictionary;

export default onboardingContent;

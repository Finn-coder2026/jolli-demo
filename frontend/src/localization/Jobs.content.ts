import { type Dictionary, insert, t } from "intlayer";

/**
 * Localization content for all job types.
 * Includes titles, descriptions, log messages, and completion messages.
 *
 * Message key format:
 * - Job title: jobs.<job-name>.title
 * - Job description: jobs.<job-name>.description
 * - Log messages: jobs.<job-name>.logs.<message-key>
 * - Completion: jobs.<job-name>.completion.<message-key>
 */
const jobsContent = {
	key: "jobs",
	content: {
		// ============================================
		// CORE JOBS (2 jobs)
		// ============================================

		"core:cleanup-old-jobs": {
			title: t({
				en: "Cleanup Old Jobs",
				es: "Limpiar trabajos antiguos",
			}),
			description: t({
				en: "Remove old job execution records",
				es: "Eliminar registros de ejecución de trabajos antiguos",
			}),
			logs: {
				starting: t({
					en: "Starting cleanup of old jobs...",
					es: "Iniciando limpieza de trabajos antiguos...",
				}),
				"processing-records": t({
					en: insert("Processing {{count}} old job records"),
					es: insert("Procesando {{count}} registros de trabajos antiguos"),
				}),
				"cleanup-complete": t({
					en: insert("Cleanup completed. Removed {{count}} old jobs"),
					es: insert("Limpieza completada. Se eliminaron {{count}} trabajos antiguos"),
				}),
			},
			completion: {
				success: t({
					en: "Successfully cleaned up old job records",
					es: "Registros de trabajos antiguos limpiados exitosamente",
				}),
			},
		},

		"core:health-check": {
			title: t({
				en: "Health Check",
				es: "Verificación de salud",
			}),
			description: t({
				en: "Performs system health checks",
				es: "Realiza verificaciones de salud del sistema",
			}),
			logs: {
				starting: t({
					en: "Running health check...",
					es: "Ejecutando verificación de salud...",
				}),
			},
			completion: {
				success: t({
					en: "Health check completed successfully",
					es: "Verificación de salud completada exitosamente",
				}),
			},
		},

		// ============================================
		// DEMO JOBS (5 jobs)
		// ============================================

		"demo:quick-stats": {
			title: t({
				en: "Quick Stats Demo",
				es: "Demo de estadísticas rápidas",
			}),
			description: t({
				en: "Quick demo job showing simple stat updates (5-10 seconds)",
				es: "Trabajo de demostración rápido mostrando actualizaciones simples de estadísticas (5-10 segundos)",
			}),
			logs: {
				starting: t({
					en: "Starting quick stats demo",
					es: "Iniciando demo de estadísticas rápidas",
				}),
				"processed-progress": t({
					en: insert("Processed: {{processed}}%"),
					es: insert("Procesado: {{processed}}%"),
				}),
				completed: t({
					en: "Quick stats demo completed",
					es: "Demo de estadísticas rápidas completado",
				}),
			},
			completion: {
				success: t({
					en: "Quick stats demo completed successfully",
					es: "Demo de estadísticas rápidas completado exitosamente",
				}),
			},
		},

		"demo:multi-stat-progress": {
			title: t({
				en: "Multi-Stat Progress Demo",
				es: "Demo de progreso multi-estadísticas",
			}),
			description: t({
				en: "Demo job showing multiple stats updating (15-20 seconds)",
				es: "Trabajo de demostración mostrando múltiples estadísticas actualizándose (15-20 segundos)",
			}),
			logs: {
				starting: t({
					en: "Starting multi-stat progress demo",
					es: "Iniciando demo de progreso multi-estadísticas",
				}),
				progress: t({
					en: insert("Progress: {{filesProcessed}} files, {{errors}} errors, {{warnings}} warnings"),
					es: insert("Progreso: {{filesProcessed}} archivos, {{errors}} errores, {{warnings}} advertencias"),
				}),
				completed: t({
					en: "Multi-stat progress demo completed",
					es: "Demo de progreso multi-estadísticas completado",
				}),
			},
			completion: {
				success: t({
					en: "Multi-stat progress demo completed successfully",
					es: "Demo de progreso multi-estadísticas completado exitosamente",
				}),
			},
		},

		"demo:articles-link": {
			title: t({
				en: "Articles Processing Demo",
				es: "Demo de procesamiento de artículos",
			}),
			description: t({
				en: "Demo job with completion link to Articles page (10-15 seconds)",
				es: "Trabajo de demostración con enlace de completado a página de artículos (10-15 segundos)",
			}),
			logs: {
				starting: t({
					en: "Starting articles link demo",
					es: "Iniciando demo de enlace de artículos",
				}),
				"processed-articles": t({
					en: insert("Processed {{processed}} of {{total}} articles"),
					es: insert("Procesados {{processed}} de {{total}} artículos"),
				}),
				completed: t({
					en: "Articles link demo completed",
					es: "Demo de enlace de artículos completado",
				}),
			},
			completion: {
				success: t({
					en: "Article processing complete. Click to view articles.",
					es: "Procesamiento de artículos completado. Haz clic para ver artículos.",
				}),
			},
		},

		"demo:slow-processing": {
			title: t({
				en: "Slow Processing Demo",
				es: "Demo de procesamiento lento",
			}),
			description: t({
				en: "Long-running demo job with multiple phases (30-40 seconds)",
				es: "Trabajo de demostración de larga duración con múltiples fases (30-40 segundos)",
			}),
			logs: {
				starting: t({
					en: "Starting slow processing demo",
					es: "Iniciando demo de procesamiento lento",
				}),
				"phase-progress": t({
					en: insert("{{phase}}: {{progress}}% ({{itemsProcessed}} items)"),
					es: insert("{{phase}}: {{progress}}% ({{itemsProcessed}} elementos)"),
				}),
				completed: t({
					en: "Slow processing demo completed",
					es: "Demo de procesamiento lento completado",
				}),
			},
			completion: {
				success: t({
					en: "Slow processing demo completed. All items processed successfully.",
					es: "Demo de procesamiento lento completado. Todos los elementos procesados exitosamente.",
				}),
			},
		},

		"demo:run-end2end-flow": {
			title: t({
				en: "Run End2End Flow",
				es: "Ejecutar flujo End2End",
			}),
			description: t({
				en: "Sample job that prints hello world",
				es: "Trabajo de muestra que imprime hello world",
			}),
			logs: {
				"selected-integration": t({
					en: insert("Selected integrationId: {{integrationId}}"),
					es: insert("ID de integración seleccionado: {{integrationId}}"),
				}),
				"hello-world": t({
					en: "hello world",
					es: "hola mundo",
				}),
			},
		},

		// ============================================
		// KNOWLEDGE GRAPH JOBS (5 jobs)
		// ============================================

		"knowledge-graph:architecture": {
			title: t({
				en: "Knowledge Graph Build",
				es: "Construcción de grafo de conocimiento",
			}),
			description: t({
				en: "Process a GitHub integration to generate knowledge graph data",
				es: "Procesar una integración de GitHub para generar datos del grafo de conocimiento",
			}),
			logs: {
				starting: t({
					en: insert("Starting knowledge graph processing for integration {{integrationId}}"),
					es: insert("Iniciando procesamiento de grafo de conocimiento para integración {{integrationId}}"),
				}),
				"fetching-token": t({
					en: insert("Fetching access token for integration {{integrationId}}"),
					es: insert("Obteniendo token de acceso para integración {{integrationId}}"),
				}),
				"token-obtained": t({
					en: insert("Successfully obtained access token for integration {{integrationId}}"),
					es: insert("Token de acceso obtenido exitosamente para integración {{integrationId}}"),
				}),
				"using-repo": t({
					en: insert("Using repo from integration: {{repo}}"),
					es: insert("Usando repositorio de integración: {{repo}}"),
				}),
				"using-first-repo": t({
					en: insert("Using first repo from installation: {{repo}}"),
					es: insert("Usando primer repositorio de instalación: {{repo}}"),
				}),
				"running-workflow": t({
					en: insert("Running code-docs workflow for {{githubUrl}}"),
					es: insert("Ejecutando flujo code-docs para {{githubUrl}}"),
				}),
				"workflow-complete": t({
					en: "Workflow completed successfully",
					es: "Flujo completado exitosamente",
				}),
				"assistant-output": t({
					en: insert("Assistant output length: {{length}} characters"),
					es: insert("Longitud de salida del asistente: {{length}} caracteres"),
				}),
				"files-generated": t({
					en: insert("Generated {{count}} output file(s)"),
					es: insert("Se generaron {{count}} archivo(s) de salida"),
				}),
				completed: t({
					en: insert("Knowledge graph processing completed for integration {{integrationId}}"),
					es: insert("Procesamiento de grafo de conocimiento completado para integración {{integrationId}}"),
				}),
				error: t({
					en: insert("Error processing integration {{integrationId}}: {{error}}"),
					es: insert("Error procesando integración {{integrationId}}: {{error}}"),
				}),
			},
			completion: {
				success: t({
					en: "Knowledge graph processing completed successfully",
					es: "Procesamiento de grafo de conocimiento completado exitosamente",
				}),
			},
		},

		"knowledge-graph:code-to-api-articles": {
			title: t({
				en: "Code to API Articles",
				es: "Código a artículos de API",
			}),
			description: t({
				en: "Generate API articles from code (code2docusaurus), persist to Doc DB",
				es: "Generar artículos de API desde código (code2docusaurus), persistir en base de datos de documentos",
			}),
			logs: {
				starting: t({
					en: insert("Starting code-to-api-articles for integration {{integrationId}}"),
					es: insert("Iniciando código-a-artículos-API para integración {{integrationId}}"),
				}),
				"fetching-token": t({
					en: insert("Fetching access token for integration {{integrationId}}"),
					es: insert("Obteniendo token de acceso para integración {{integrationId}}"),
				}),
				"token-obtained": t({
					en: insert("Successfully obtained access token for integration {{integrationId}}"),
					es: insert("Token de acceso obtenido exitosamente para integración {{integrationId}}"),
				}),
				"using-repo": t({
					en: insert("Using repo from integration: {{repo}}"),
					es: insert("Usando repositorio de integración: {{repo}}"),
				}),
				"running-workflow": t({
					en: insert("Running code-to-api-docs workflow for {{githubUrl}}"),
					es: insert("Ejecutando flujo código-a-docs-API para {{githubUrl}}"),
				}),
				"sandbox-id-captured": t({
					en: insert("Captured sandbox ID: {{sandboxId}}"),
					es: insert("ID de sandbox capturado: {{sandboxId}}"),
				}),
				"scanning-files": t({
					en: insert("[syncIt] Scanning {{count}} file(s) under {{root}}"),
					es: insert("[syncIt] Escaneando {{count}} archivo(s) bajo {{root}}"),
				}),
				"file-persisted": t({
					en: insert("[syncIt] persisted {{jrn}} ({{bytes}} bytes)"),
					es: insert("[syncIt] persistido {{jrn}} ({{bytes}} bytes)"),
				}),
				"file-failed": t({
					en: insert("[syncIt] failed for {{filename}}: {{error}}"),
					es: insert("[syncIt] falló para {{filename}}: {{error}}"),
				}),
				"post-sync-failed": t({
					en: insert("[syncIt] post-sync failed: {{error}}"),
					es: insert("[syncIt] post-sincronización falló: {{error}}"),
				}),
				completed: t({
					en: insert("Code 2 API Articles completed for integration {{integrationId}}"),
					es: insert("Código a artículos de API completado para integración {{integrationId}}"),
				}),
				error: t({
					en: insert("Error process integration for code-to-api-articles: {{error}}"),
					es: insert("Error procesando integración para código-a-artículos-API: {{error}}"),
				}),
			},
			completion: {
				success: t({
					en: "API articles generated successfully",
					es: "Artículos de API generados exitosamente",
				}),
			},
		},

		"knowledge-graph:docs-to-docusaurus": {
			title: t({
				en: "Docs to Docusaurus",
				es: "Documentos a Docusaurus",
			}),
			description: t({
				en: "Convert documentation from GitHub repository to Docusaurus format",
				es: "Convertir documentación de repositorio GitHub a formato Docusaurus",
			}),
			logs: {
				starting: t({
					en: insert("Starting docs-to-docusaurus processing for integration {{integrationId}}"),
					es: insert("Iniciando procesamiento docs-a-docusaurus para integración {{integrationId}}"),
				}),
				"fetching-token": t({
					en: insert("Fetching access token for integration {{integrationId}}"),
					es: insert("Obteniendo token de acceso para integración {{integrationId}}"),
				}),
				"token-obtained": t({
					en: insert("Successfully obtained access token for integration {{integrationId}}"),
					es: insert("Token de acceso obtenido exitosamente para integración {{integrationId}}"),
				}),
				"using-repo": t({
					en: insert("Using repo from integration: {{repo}}"),
					es: insert("Usando repositorio de integración: {{repo}}"),
				}),
				"running-workflow": t({
					en: insert("Running docs-to-site workflow for {{githubUrl}}"),
					es: insert("Ejecutando flujo docs-a-sitio para {{githubUrl}}"),
				}),
				"sandbox-id-captured": t({
					en: insert("Captured sandbox ID: {{sandboxId}}"),
					es: insert("ID de sandbox capturado: {{sandboxId}}"),
				}),
				"sync-starting": t({
					en: "[syncIt] Starting sync from /home/space-1 to api-docs/docs/",
					es: "[syncIt] Iniciando sincronización desde /home/space-1 a api-docs/docs/",
				}),
				"no-documents": t({
					en: "[syncIt] No documents found in /home/space-1",
					es: "[syncIt] No se encontraron documentos en /home/space-1",
				}),
				"found-documents": t({
					en: insert("[syncIt] Found {{count}} documents to sync"),
					es: insert("[syncIt] Se encontraron {{count}} documentos para sincronizar"),
				}),
				"writing-file": t({
					en: insert("[syncIt] Writing {{jrn}} to {{targetPath}} ({{bytes}} bytes)"),
					es: insert("[syncIt] Escribiendo {{jrn}} a {{targetPath}} ({{bytes}} bytes)"),
				}),
				"sync-failed": t({
					en: insert("[syncIt] Failed to sync {{jrn}}: {{error}}"),
					es: insert("[syncIt] Falló al sincronizar {{jrn}}: {{error}}"),
				}),
				"sync-completed": t({
					en: "[syncIt] Sync completed successfully",
					es: "[syncIt] Sincronización completada exitosamente",
				}),
				"sync-error": t({
					en: insert("[syncIt] Sync failed: {{error}}"),
					es: insert("[syncIt] Sincronización falló: {{error}}"),
				}),
				completed: t({
					en: insert("Docs-to-docusaurus processing completed for integration {{integrationId}}"),
					es: insert("Procesamiento docs-a-docusaurus completado para integración {{integrationId}}"),
				}),
				error: t({
					en: insert("Error process integration for docs-to-docusaurus: {{error}}"),
					es: insert("Error procesando integración para docs-a-docusaurus: {{error}}"),
				}),
			},
			completion: {
				success: t({
					en: "Documentation converted to Docusaurus successfully",
					es: "Documentación convertida a Docusaurus exitosamente",
				}),
			},
		},

		"knowledge-graph:run-jolliscript": {
			title: t({
				en: "Run JolliScript Workflow",
				es: "Ejecutar flujo JolliScript",
			}),
			description: t({
				en: "Execute the run-jolliscript workflow for stored DocDao markdown content",
				es: "Ejecutar el flujo run-jolliscript para contenido markdown almacenado en DocDao",
			}),
			logs: {
				starting: t({
					en: insert("Starting run-jolliscript workflow for {{docJrn}}"),
					es: insert("Iniciando flujo run-jolliscript para {{docJrn}}"),
				}),
				"doc-not-found": t({
					en: insert("Document {{docJrn}} not found"),
					es: insert("Documento {{docJrn}} no encontrado"),
				}),
				"doc-no-content": t({
					en: insert("Document {{docJrn}} has no content to process"),
					es: insert("Documento {{docJrn}} no tiene contenido para procesar"),
				}),
				"sandbox-id-captured": t({
					en: insert("Captured sandbox ID: {{sandboxId}}"),
					es: insert("ID de sandbox capturado: {{sandboxId}}"),
				}),
				"scanning-files": t({
					en: insert("[syncIt] Scanning {{count}} file(s) under {{root}}"),
					es: insert("[syncIt] Escaneando {{count}} archivo(s) bajo {{root}}"),
				}),
				"file-persisted": t({
					en: insert("[syncIt] persisted {{jrn}} ({{bytes}} bytes)"),
					es: insert("[syncIt] persistido {{jrn}} ({{bytes}} bytes)"),
				}),
				"file-failed": t({
					en: insert("[syncIt] failed for {{filename}}: {{error}}"),
					es: insert("[syncIt] falló para {{filename}}: {{error}}"),
				}),
				"sync-failed": t({
					en: insert("[syncIt] sync failed: {{error}}"),
					es: insert("[syncIt] sincronización falló: {{error}}"),
				}),
				completed: t({
					en: insert("run-jolliscript workflow completed for {{docJrn}}"),
					es: insert("Flujo run-jolliscript completado para {{docJrn}}"),
				}),
				error: t({
					en: insert("Error run-jolliscript workflow: {{error}}"),
					es: insert("Error en flujo run-jolliscript: {{error}}"),
				}),
			},
			completion: {
				success: t({
					en: "JolliScript workflow completed successfully",
					es: "Flujo JolliScript completado exitosamente",
				}),
			},
		},

		"knowledge-graph:process-git-push": {
			title: t({
				en: "Process Git Push",
				es: "Procesar push de Git",
			}),
			description: t({
				en: "Processes Git Push events from github",
				es: "Procesa eventos de push de Git desde github",
			}),
			logs: {
				"git-push": t({
					en: insert("Git push received: ref={{ref}}, before={{before}}, after={{after}}"),
					es: insert("Push de Git recibido: ref={{ref}}, antes={{before}}, después={{after}}"),
				}),
				"files-added": t({
					en: insert("Files added: {{files}}"),
					es: insert("Archivos agregados: {{files}}"),
				}),
				"files-modified": t({
					en: insert("Files modified: {{files}}"),
					es: insert("Archivos modificados: {{files}}"),
				}),
				"files-removed": t({
					en: insert("Files removed: {{files}}"),
					es: insert("Archivos removidos: {{files}}"),
				}),
			},
		},

		// ============================================
		// GITHUB INTEGRATION JOBS (4 jobs)
		// ============================================

		"handle-installation-created": {
			title: t({
				en: "GitHub App Installed",
				es: "Aplicación GitHub instalada",
			}),
			description: t({
				en: "Handles GitHub App installation created event - creates installation tracking and heals broken integrations",
				es: "Maneja evento de creación de instalación de aplicación GitHub - crea seguimiento de instalación y repara integraciones rotas",
			}),
			logs: {
				"missing-installation-info": t({
					en: insert("Missing installation ID or app ID in {{eventType}} event"),
					es: insert("Falta ID de instalación o ID de aplicación en evento {{eventType}}"),
				}),
				"integration-healed": t({
					en: insert("Healed integration {{integrationId}} for repo {{repo}}"),
					es: insert("Integración {{integrationId}} reparada para repositorio {{repo}}"),
				}),
				"processing-complete": t({
					en: insert(
						"Installation created event processed: installationId={{installationId}}, appId={{appId}}, repoCount={{repoCount}}, healedCount={{healedCount}}",
					),
					es: insert(
						"Evento de instalación creada procesado: installationId={{installationId}}, appId={{appId}}, repoCount={{repoCount}}, healedCount={{healedCount}}",
					),
				}),
			},
		},

		"github:handle-installation-deleted": {
			title: t({
				en: "GitHub App Uninstalled",
				es: "Aplicación GitHub desinstalada",
			}),
			description: t({
				en: "Handles GitHub App installation deleted event - marks installation as uninstalled and disables affected integrations",
				es: "Maneja evento de eliminación de instalación de aplicación GitHub - marca instalación como desinstalada y deshabilita integraciones afectadas",
			}),
			logs: {
				"missing-installation-info": t({
					en: insert("Missing installation ID or app ID in {{eventType}} event"),
					es: insert("Falta ID de instalación o ID de aplicación en evento {{eventType}}"),
				}),
				"installation-marked-uninstalled": t({
					en: insert("Marked installation {{name}} ({{installationId}}) as uninstalled"),
					es: insert("Instalación {{name}} ({{installationId}}) marcada como desinstalada"),
				}),
				"installation-not-found": t({
					en: insert("Installation {{installationId}} not found when processing uninstall"),
					es: insert("Instalación {{installationId}} no encontrada al procesar desinstalación"),
				}),
				"integration-disabled": t({
					en: insert("Disabled integration {{integrationId}} for repo {{repo}} (reason: {{reason}})"),
					es: insert(
						"Integración {{integrationId}} deshabilitada para repositorio {{repo}} (razón: {{reason}})",
					),
				}),
				"installation-deleted-complete": t({
					en: insert(
						"Installation deleted event processed: installationId={{installationId}}, appId={{appId}}, affectedCount={{affectedCount}}",
					),
					es: insert(
						"Evento de instalación eliminada procesado: installationId={{installationId}}, appId={{appId}}, affectedCount={{affectedCount}}",
					),
				}),
			},
		},

		"github:handle-repositories-added": {
			title: t({
				en: "GitHub Repos Added to App Install",
				es: "Repositorios GitHub agregados a instalación de aplicación",
			}),
			description: t({
				en: "Handles repositories added to GitHub App installation event - updates installation tracking",
				es: "Maneja evento de repositorios agregados a instalación de aplicación GitHub - actualiza seguimiento de instalación",
			}),
			logs: {
				"missing-installation-info": t({
					en: insert("Missing installation ID or app ID in {{eventType}} event"),
					es: insert("Falta ID de instalación o ID de aplicación en evento {{eventType}}"),
				}),
				"repos-added-complete": t({
					en: insert(
						"Repositories added event processed: installationId={{installationId}}, appId={{appId}}, addedCount={{addedCount}}",
					),
					es: insert(
						"Evento de repositorios agregados procesado: installationId={{installationId}}, appId={{appId}}, addedCount={{addedCount}}",
					),
				}),
			},
		},

		"github:handle-repositories-removed": {
			title: t({
				en: "GitHub Repos Removed from App Install",
				es: "Repositorios GitHub removidos de instalación de aplicación",
			}),
			description: t({
				en: "Handles repositories removed from GitHub App installation event - updates installation tracking and disables affected integrations",
				es: "Maneja evento de repositorios removidos de instalación de aplicación GitHub - actualiza seguimiento de instalación y deshabilita integraciones afectadas",
			}),
			logs: {
				"missing-installation-info": t({
					en: insert("Missing installation ID or app ID in {{eventType}} event"),
					es: insert("Falta ID de instalación o ID de aplicación en evento {{eventType}}"),
				}),
				"no-integration-found": t({
					en: insert("No integration found for repository {{repo}}"),
					es: insert("No se encontró integración para repositorio {{repo}}"),
				}),
				"integration-disabled": t({
					en: insert("Disabled integration {{integrationId}} for repo {{repo}} (reason: {{reason}})"),
					es: insert(
						"Integración {{integrationId}} deshabilitada para repositorio {{repo}} (razón: {{reason}})",
					),
				}),
				"repos-removed-complete": t({
					en: insert(
						"Repositories removed event processed: installationId={{installationId}}, appId={{appId}}, removedCount={{removedCount}}",
					),
					es: insert(
						"Evento de repositorios removidos procesado: installationId={{installationId}}, appId={{appId}}, removedCount={{removedCount}}",
					),
				}),
			},
		},

		// ============================================
		// INTEGRATION JOBS (Dynamic - based on type)
		// ============================================

		integration: {
			sync: {
				title: t({
					en: insert("Sync {{integrationName}}"),
					es: insert("Sincronizar {{integrationName}}"),
				}),
				description: t({
					en: insert("Synchronize data from {{integrationName}} integration"),
					es: insert("Sincronizar datos desde integración {{integrationName}}"),
				}),
				logs: {
					starting: t({
						en: insert("Starting {{integrationName}} sync..."),
						es: insert("Iniciando sincronización de {{integrationName}}..."),
					}),
					"sync-complete": t({
						en: insert("{{integrationName}} sync completed"),
						es: insert("Sincronización de {{integrationName}} completada"),
					}),
				},
				completion: {
					success: t({
						en: insert("{{integrationName}} synchronized successfully"),
						es: insert("{{integrationName}} sincronizado exitosamente"),
					}),
				},
			},
			process: {
				title: t({
					en: insert("Process {{integrationName}} Event"),
					es: insert("Procesar evento de {{integrationName}}"),
				}),
				description: t({
					en: insert("Process event from {{integrationName}} integration"),
					es: insert("Procesar evento desde integración {{integrationName}}"),
				}),
				logs: {
					starting: t({
						en: insert("Processing {{integrationName}} event..."),
						es: insert("Procesando evento de {{integrationName}}..."),
					}),
					"event-processed": t({
						en: insert("{{integrationName}} event processed"),
						es: insert("Evento de {{integrationName}} procesado"),
					}),
					"processing-event": t({
						en: insert("Processing {{eventName}} for repo {{repo}} and branch {{branch}}"),
						es: insert("Procesando {{eventName}} para repositorio {{repo}} y rama {{branch}}"),
					}),
				},
				completion: {
					success: t({
						en: insert("{{integrationName}} event processed successfully"),
						es: insert("Evento de {{integrationName}} procesado exitosamente"),
					}),
				},
			},
		},

		// ============================================
		// COMMON ERROR MESSAGES
		// ============================================

		errors: {
			"invalid-params": t({
				en: insert("Invalid job parameters: {{error}}"),
				es: insert("Parámetros de trabajo inválidos: {{error}}"),
			}),
			"job-failed": t({
				en: insert("Job failed: {{error}}"),
				es: insert("Trabajo falló: {{error}}"),
			}),
			timeout: t({
				en: insert("Job timed out after {{duration}}s"),
				es: insert("Trabajo agotó tiempo de espera después de {{duration}}s"),
			}),
			cancelled: t({
				en: "Job was cancelled",
				es: "El trabajo fue cancelado",
			}),
			"loop-prevented": t({
				en: insert("Infinite loop prevented: {{reason}}"),
				es: insert("Bucle infinito prevenido: {{reason}}"),
			}),
		},

		// ============================================
		// JOB STATUS LABELS
		// ============================================

		status: {
			queued: t({
				en: "Queued",
				es: "En cola",
			}),
			active: t({
				en: "Running",
				es: "Ejecutando",
			}),
			completed: t({
				en: "Completed",
				es: "Completado",
			}),
			failed: t({
				en: "Failed",
				es: "Falló",
			}),
			cancelled: t({
				en: "Cancelled",
				es: "Cancelado",
			}),
		},

		// ============================================
		// JOB STATS LABELS
		// ============================================

		stats: {
			activeCount: t({
				en: "Running",
				es: "Ejecutando",
			}),
			completedCount: t({
				en: "Completed",
				es: "Completados",
			}),
			failedCount: t({
				en: "Failed",
				es: "Fallidos",
			}),
			totalRetries: t({
				en: "Retries",
				es: "Reintentos",
			}),
		},

		// ============================================
		// JOB SCHEDULER MESSAGES
		// ============================================

		scheduler: {
			logs: {
				"job-starting": t({
					en: insert("Starting job: {{jobName}}"),
					es: insert("Iniciando trabajo: {{jobName}}"),
				}),
				"job-completed": t({
					en: insert("Completed job: {{jobName}}"),
					es: insert("Trabajo completado: {{jobName}}"),
				}),
				"job-failed": t({
					en: insert("Failed job: {{jobName}} - {{errorMessage}}"),
					es: insert("Trabajo fallido: {{jobName}} - {{errorMessage}}"),
				}),
				"created-from-event": t({
					en: insert("Created from event: {{eventName}}"),
					es: insert("Creado desde evento: {{eventName}}"),
				}),
			},
			messages: {
				"job-queued-successfully": t({
					en: "Job queued successfully",
					es: "Trabajo encolado exitosamente",
				}),
				"job-scheduled-with-cron": t({
					en: insert("Job scheduled with cron: {{cron}}"),
					es: insert("Trabajo programado con cron: {{cron}}"),
				}),
			},
		},

		// ============================================
		// WORKFLOW ORCHESTRATION MESSAGES
		// ============================================

		workflows: {
			logs: {
				"sandbox-created": t({
					en: insert("Created sandbox: {{sandboxId}}"),
					es: insert("Sandbox creado: {{sandboxId}}"),
				}),
				"syncit-write-error": t({
					en: insert("[syncIt] writeFile error: {{error}}"),
					es: insert("[syncIt] error al escribir archivo: {{error}}"),
				}),
				"syncit-write-success": t({
					en: insert("[syncIt] {{result}}"),
					es: insert("[syncIt] {{result}}"),
				}),
				"syncit-list-error": t({
					en: insert("[syncIt] listFiles error: {{error}}"),
					es: insert("[syncIt] error al listar archivos: {{error}}"),
				}),
				"syncit-read-error": t({
					en: insert("[syncIt] readFile error: {{error}}"),
					es: insert("[syncIt] error al leer archivo: {{error}}"),
				}),
				"syncit-before-start": t({
					en: "[workflow] Found syncIt(before), executing now",
					es: "[workflow] Se encontró syncIt(before), ejecutando ahora",
				}),
				"syncit-before-complete": t({
					en: "[workflow] syncIt(before) completed successfully",
					es: "[workflow] syncIt(before) completado exitosamente",
				}),
				"syncit-before-failed": t({
					en: insert("[workflow] syncIt(before) failed: {{error}}"),
					es: insert("[workflow] syncIt(before) falló: {{error}}"),
				}),
				"tool-call": t({
					en: insert("Tool call: {{name}}({{arguments}})"),
					es: insert("Llamada a herramienta: {{name}}({{arguments}})"),
				}),
				"docs-dir-detected": t({
					en: insert("Detected DOCS_DIR from tool output: {{docsDir}}"),
					es: insert("DOCS_DIR detectado desde salida de herramienta: {{docsDir}}"),
				}),
				"tool-completed": t({
					en: insert("Tool result: {{name}} completed"),
					es: insert("Resultado de herramienta: {{name}} completado"),
				}),
				"finalizer-failed": t({
					en: insert("Finalizer failed: {{error}}"),
					es: insert("Finalizador falló: {{error}}"),
				}),
				"post-sync-docs-root": t({
					en: insert("[workflow] Using docsRoot={{docsRoot}} for post-sync"),
					es: insert("[workflow] Usando docsRoot={{docsRoot}} para post-sync"),
				}),
				"syncit-after-start": t({
					en: "[workflow] Found syncIt(after), executing now",
					es: "[workflow] Se encontró syncIt(after), ejecutando ahora",
				}),
				"syncit-after-complete": t({
					en: "[workflow] syncIt(after) completed successfully",
					es: "[workflow] syncIt(after) completado exitosamente",
				}),
				"syncit-after-failed": t({
					en: insert("[workflow] syncIt(after) failed: {{error}}"),
					es: insert("[workflow] syncIt(after) falló: {{error}}"),
				}),
				"sandbox-kill-proactive": t({
					en: "Killing sandbox as requested (proactive cleanup)",
					es: "Terminando sandbox según solicitado (limpieza proactiva)",
				}),
				"sandbox-kill-proactive-failed": t({
					en: insert("Failed to kill sandbox during proactive cleanup: {{error}}"),
					es: insert("Falló al terminar sandbox durante limpieza proactiva: {{error}}"),
				}),
				"workflow-fatal-error": t({
					en: insert("Workflow fatal error: {{error}}"),
					es: insert("Error fatal de flujo de trabajo: {{error}}"),
				}),
				"workflow-starting": t({
					en: insert("Starting {{workflowType}} workflow in E2B mode"),
					es: insert("Iniciando flujo de trabajo {{workflowType}} en modo E2B"),
				}),
				"workflow-complete": t({
					en: "Workflow completed successfully",
					es: "Flujo de trabajo completado exitosamente",
				}),
				"workflow-files-generated": t({
					en: insert("Generated {{fileCount}} output file(s)"),
					es: insert("Se generaron {{fileCount}} archivo(s) de salida"),
				}),
				"workflow-failed": t({
					en: insert("Workflow failed: {{error}}"),
					es: insert("Flujo de trabajo falló: {{error}}"),
				}),
				"workflow-execution-error": t({
					en: insert("Workflow execution error: {{error}}"),
					es: insert("Error de ejecución de flujo de trabajo: {{error}}"),
				}),
				"sandbox-kill-requested": t({
					en: "Killing sandbox as requested",
					es: "Terminando sandbox según solicitado",
				}),
				"sandbox-left-running": t({
					en: "Sandbox left running (killSandbox=false)",
					es: "Sandbox dejado en ejecución (killSandbox=false)",
				}),
				"sandbox-cleanup-failed": t({
					en: insert("Failed to clean up sandbox: {{error}}"),
					es: insert("Falló al limpiar sandbox: {{error}}"),
				}),
				"code-to-api-docs-complete": t({
					en: insert("[direct] code-to-api-docs finished. DOCS_DIR={{docsDir}}"),
					es: insert("[direct] code-to-api-docs finalizado. DOCS_DIR={{docsDir}}"),
				}),
			},
		},
	},
} satisfies Dictionary;

export default jobsContent;

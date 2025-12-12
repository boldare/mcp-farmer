import type { Reporter, ReportData } from "./shared.js";

export const jsonReporter: Reporter = (data: ReportData): string => {
  // Handle auth error case
  if (data.authError) {
    return JSON.stringify(
      {
        error: "authentication_required",
        message: data.authError.message,
        authHeader: data.authError.authHeader,
      },
      null,
      2,
    );
  }

  return JSON.stringify(
    {
      tools: {
        items: data.tools,
        responseTimeMs: data.toolsResponseTimeMs,
      },
      prompts: {
        supported: data.promptsSupported,
        items: data.prompts,
        responseTimeMs: data.promptsResponseTimeMs,
      },
      resources: {
        supported: data.resourcesSupported,
        items: data.resources,
        responseTimeMs: data.resourcesResponseTimeMs,
      },
      health: data.health,
      findings: data.findings,
    },
    null,
    2,
  );
};

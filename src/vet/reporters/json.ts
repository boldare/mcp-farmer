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
      tools: data.tools,
      health: data.health,
      findings: data.findings,
      meta: { toolsResponseTimeMs: data.toolsResponseTimeMs },
    },
    null,
    2,
  );
};

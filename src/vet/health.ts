export interface HealthCheckResult {
  available: boolean;
  status?: number;
  error?: string;
}

export async function checkHealth(url: URL): Promise<HealthCheckResult> {
  const healthUrl = new URL("/health", url.origin);

  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    return {
      available: response.ok,
      status: response.status,
    };
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

import type { ApiResult } from "@filapilot/shared";

export class ApiRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init.headers
    }
  });

  const body = (await response.json()) as ApiResult<T>;
  if (body.error) {
    throw new ApiRequestError(body.error.code, body.error.message);
  }
  return body.data;
}

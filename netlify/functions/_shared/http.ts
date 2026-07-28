/** Parses a request's JSON body as a loosely-typed record — every field still needs its own
 * runtime check at the call site (this only gets us past `unknown` without an `as` cast per field). */
export async function parseJsonBody(req: Request): Promise<Record<string, unknown>> {
  const body: unknown = await req.json().catch(() => null)
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
}

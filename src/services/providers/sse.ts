/* Minimal streaming helpers shared by the real HTTP drivers. */

/** Async-iterate decoded UTF-8 text chunks from a fetch Response body. */
export async function* readTextStream(
  res: Response,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse a Server-Sent-Events stream into `data:` payload strings.
 * Buffers partial lines across chunks.
 */
export async function* parseSSE(
  res: Response,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  let buffer = '';
  for await (const chunk of readTextStream(res, signal)) {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line.startsWith('data:')) {
        yield line.slice(5).trim();
      }
    }
  }
  const tail = buffer.trim();
  if (tail.startsWith('data:')) yield tail.slice(5).trim();
}

/** Parse a newline-delimited JSON (NDJSON) stream, e.g. Ollama. */
export async function* parseNDJSON(
  res: Response,
  signal?: AbortSignal,
): AsyncGenerator<unknown> {
  let buffer = '';
  for await (const chunk of readTextStream(res, signal)) {
    buffer += chunk;
    let idx: number;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) {
        try { yield JSON.parse(line); } catch { /* skip partial */ }
      }
    }
  }
  const tail = buffer.trim();
  if (tail) {
    try { yield JSON.parse(tail); } catch { /* ignore */ }
  }
}

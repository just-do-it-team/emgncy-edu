export async function readSseStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (eventName: string, data: string) => void,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let data: string[] = [];

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error("Поток событий закрылся.");
      buffer += decoder.decode(chunk.value, { stream: true });

      let end = buffer.indexOf("\n");
      while (end !== -1) {
        const line = buffer.slice(0, end).replace(/\r$/, "");
        buffer = buffer.slice(end + 1);
        if (!line) {
          if (data.length) onEvent(eventName, data.join("\n"));
          eventName = "message";
          data = [];
        } else if (!line.startsWith(":")) {
          const colon = line.indexOf(":");
          const field = colon === -1 ? line : line.slice(0, colon);
          const value =
            colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
          if (field === "event") eventName = value;
          if (field === "data") data.push(value);
        }
        end = buffer.indexOf("\n");
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

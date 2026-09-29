type WorkerReply = { id: number; misspelled: [string, string[]][] } | { id: number; failed: true };

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (value: Map<string, string[]>) => void; reject: (error: Error) => void }>();

function workerInstance(): Worker {
  if (worker !== null) return worker;

  const created = new Worker(new URL("./spell.worker.ts", import.meta.url), { type: "module" });

  created.addEventListener("message", (event: MessageEvent<WorkerReply>) => {
    const reply = event.data;
    const waiting = pending.get(reply.id);

    pending.delete(reply.id);
    if (!waiting) return;
    if ("failed" in reply) waiting.reject(new Error("Словарь не загрузился"));
    else waiting.resolve(new Map(reply.misspelled));
  });
  worker = created;
  return created;
}

/**
 * Проверка слов по русскому словарю в отдельном потоке: словарь весит несколько мегабайт и
 * разбирается около секунды, поэтому он грузится лениво при первой проверке и не блокирует
 * интерфейс. Возвращает только слова с ошибкой и до трёх вариантов исправления.
 */
export function checkWords(words: string[]): Promise<Map<string, string[]>> {
  if (words.length === 0) return Promise.resolve(new Map());

  const id = (nextId += 1);

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    workerInstance().postMessage({ id, words });
  });
}

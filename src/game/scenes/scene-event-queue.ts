export interface SceneEventBase {
  type: string;
  emittedAtSeconds: number;
}

type SceneEventListener<TEvent extends SceneEventBase> = (event: TEvent) => void;

export interface SceneEventQueue<TEvent extends SceneEventBase> {
  emit(event: TEvent): void;
  drain(): TEvent[];
  peek(): readonly TEvent[];
  clear(): void;
  subscribe(listener: SceneEventListener<TEvent>): () => void;
}

export function createSceneEventQueue<TEvent extends SceneEventBase>(): SceneEventQueue<TEvent> {
  const queue: TEvent[] = [];
  const listeners = new Set<SceneEventListener<TEvent>>();

  return {
    emit(event) {
      queue.push(event);
      for (const listener of listeners) {
        listener(event);
      }
    },
    drain() {
      return queue.splice(0, queue.length);
    },
    peek() {
      return queue;
    },
    clear() {
      queue.length = 0;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

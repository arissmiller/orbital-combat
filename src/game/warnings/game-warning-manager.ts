export interface GameWarningCandidate {
  id: string;
  title: string;
  message: string;
  accentColor: string;
  priority: number;
  active: boolean;
}

export interface GameWarningState {
  id: string;
  title: string;
  message: string;
  accentColor: string;
  priority: number;
}

export interface GameWarningManagerState {
  orderedWarningIds: string[];
  warningsById: Map<string, {
    warning: GameWarningState;
    visibleUntilSeconds: number;
  }>;
}

const MINIMUM_WARNING_VISIBLE_SECONDS = 0.75;

export function createGameWarningManagerState(): GameWarningManagerState {
  return {
    orderedWarningIds: [],
    warningsById: new Map(),
  };
}

export function resetGameWarningManagerState(
  state: GameWarningManagerState,
): void {
  state.orderedWarningIds = [];
  state.warningsById.clear();
}

export function updateGameWarningManager(
  state: GameWarningManagerState,
  candidates: readonly GameWarningCandidate[],
  elapsedSeconds: number,
): GameWarningState[] {
  const activeCandidateIds = new Set<string>();

  for (const candidate of candidates) {
    if (!candidate.active) {
      continue;
    }

    activeCandidateIds.add(candidate.id);
    state.warningsById.set(candidate.id, {
      warning: toGameWarningState(candidate),
      visibleUntilSeconds:
        elapsedSeconds + MINIMUM_WARNING_VISIBLE_SECONDS,
    });
  }

  for (const [warningId, entry] of [...state.warningsById.entries()]) {
    if (activeCandidateIds.has(warningId)) {
      continue;
    }

    if (elapsedSeconds >= entry.visibleUntilSeconds) {
      state.warningsById.delete(warningId);
    }
  }

  if (state.warningsById.size === 0) {
    state.orderedWarningIds = [];
    return [];
  }

  const previousOrder = new Map(
    state.orderedWarningIds.map((id, index) => [id, index] as const),
  );
  const orderedWarnings = [...state.warningsById.values()]
    .map((entry) => entry.warning)
    .sort((left, right) => {
      if (right.priority !== left.priority) {
        return right.priority - left.priority;
      }

      const leftPreviousIndex = previousOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightPreviousIndex = previousOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;

      if (leftPreviousIndex !== rightPreviousIndex) {
        return leftPreviousIndex - rightPreviousIndex;
      }

      return left.id.localeCompare(right.id);
    });

  state.orderedWarningIds = orderedWarnings.map((warning) => warning.id);
  return orderedWarnings;
}

function toGameWarningState(candidate: GameWarningCandidate): GameWarningState {
  return {
    id: candidate.id,
    title: candidate.title,
    message: candidate.message,
    accentColor: candidate.accentColor,
    priority: candidate.priority,
  };
}

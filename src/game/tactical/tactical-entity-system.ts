import type { Vector2Like } from "../physics/vector2";

export type TacticalEntityKind =
  | "ship"
  | "celestial"
  | "site"
  | "missile"
  | "marker";

export type TacticalEntityTeam =
  | "player"
  | "hostile"
  | "neutral"
  | "environment";

export interface TacticalEntity {
  id: string;
  label: string;
  kind: TacticalEntityKind;
  team: TacticalEntityTeam;
  systemId: string | null;
  position: Vector2Like;
  radius: number;
  targetable: boolean;
  scannable: boolean;
  collisionTarget: boolean;
  tags: readonly string[];
  linkedId?: string;
}

export interface TacticalEntityQuery {
  systemId?: string | null;
  kinds?: readonly TacticalEntityKind[];
  teams?: readonly TacticalEntityTeam[];
  targetable?: boolean;
  scannable?: boolean;
  collisionTarget?: boolean;
  tags?: readonly string[];
  predicate?: (entity: TacticalEntity) => boolean;
}

export interface TacticalEntityDistanceResult {
  entity: TacticalEntity;
  distance: number;
}

export interface TacticalEntitySystem {
  entries: Map<string, TacticalEntity>;
}

export function createTacticalEntitySystem(): TacticalEntitySystem {
  return {
    entries: new Map<string, TacticalEntity>(),
  };
}

export function resetTacticalEntitySystem(
  system: TacticalEntitySystem,
): void {
  system.entries.clear();
}

export function upsertTacticalEntity(
  system: TacticalEntitySystem,
  entity: TacticalEntity,
): TacticalEntity {
  const stored = {
    ...entity,
    position: { x: entity.position.x, y: entity.position.y },
    tags: [...entity.tags],
  };
  system.entries.set(entity.id, stored);
  return stored;
}

export function removeTacticalEntity(
  system: TacticalEntitySystem,
  entityId: string,
): void {
  system.entries.delete(entityId);
}

export function listTacticalEntities(
  system: TacticalEntitySystem,
  query: TacticalEntityQuery = {},
): TacticalEntity[] {
  return [...system.entries.values()].filter((entity) => matchesQuery(entity, query));
}

export function findTacticalEntitiesInRange(
  system: TacticalEntitySystem,
  origin: Vector2Like,
  range: number,
  query: TacticalEntityQuery = {},
): TacticalEntityDistanceResult[] {
  return listTacticalEntities(system, query)
    .map((entity) => ({
      entity,
      distance: distanceBetween(origin, entity.position),
    }))
    .filter((result) => result.distance <= range)
    .sort((left, right) => left.distance - right.distance);
}

export function findNearestTacticalEntity(
  system: TacticalEntitySystem,
  origin: Vector2Like,
  query: TacticalEntityQuery = {},
): TacticalEntityDistanceResult | null {
  const matches = findTacticalEntitiesInRange(
    system,
    origin,
    Number.POSITIVE_INFINITY,
    query,
  );
  return matches[0] ?? null;
}

export function findHostileTacticalEntities(
  system: TacticalEntitySystem,
  origin: Vector2Like,
  range: number,
  query: TacticalEntityQuery = {},
): TacticalEntityDistanceResult[] {
  return findTacticalEntitiesInRange(system, origin, range, {
    ...query,
    teams: query.teams ?? ["hostile"],
    targetable: query.targetable ?? true,
  });
}

function matchesQuery(
  entity: TacticalEntity,
  query: TacticalEntityQuery,
): boolean {
  if (
    query.systemId !== undefined &&
    entity.systemId !== query.systemId
  ) {
    return false;
  }

  if (query.kinds && !query.kinds.includes(entity.kind)) {
    return false;
  }

  if (query.teams && !query.teams.includes(entity.team)) {
    return false;
  }

  if (
    query.targetable !== undefined &&
    entity.targetable !== query.targetable
  ) {
    return false;
  }

  if (
    query.scannable !== undefined &&
    entity.scannable !== query.scannable
  ) {
    return false;
  }

  if (
    query.collisionTarget !== undefined &&
    entity.collisionTarget !== query.collisionTarget
  ) {
    return false;
  }

  if (query.tags && query.tags.some((tag) => !entity.tags.includes(tag))) {
    return false;
  }

  if (query.predicate && !query.predicate(entity)) {
    return false;
  }

  return true;
}

function distanceBetween(a: Vector2Like, b: Vector2Like): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

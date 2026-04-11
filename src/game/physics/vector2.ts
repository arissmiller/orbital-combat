export interface Vector2Like {
  x: number;
  y: number;
}

export const ZERO_VECTOR: Readonly<Vector2Like> = Object.freeze({ x: 0, y: 0 });

export function vec(x = 0, y = 0): Vector2Like {
  return { x, y };
}

export function add(a: Vector2Like, b: Vector2Like): Vector2Like {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subtract(a: Vector2Like, b: Vector2Like): Vector2Like {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(value: Vector2Like, scalar: number): Vector2Like {
  return { x: value.x * scalar, y: value.y * scalar };
}

export function length(value: Vector2Like): number {
  return Math.hypot(value.x, value.y);
}

export function normalize(value: Vector2Like): Vector2Like {
  const magnitude = length(value);

  if (magnitude === 0) {
    return vec();
  }

  return scale(value, 1 / magnitude);
}

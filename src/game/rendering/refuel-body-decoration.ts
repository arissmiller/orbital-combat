import { Container, Graphics } from "pixi.js";

export function decorateRefuelBodySprite(
  sprite: Container,
  options: {
    bodyRadius: number;
    refuelRange?: number;
    refuelLaneRadius?: number;
    refuelLaneThickness?: number;
    showServiceRadius?: boolean;
    showBodyMarker?: boolean;
  },
): void {
  const hasPointRefuelRange = (options.refuelRange ?? 0) > 0;
  const hasFuelLane = (options.refuelLaneRadius ?? 0) > 0;

  if (!hasPointRefuelRange && !hasFuelLane) {
    return;
  }

  if (options.showServiceRadius !== false) {
    if (hasPointRefuelRange) {
      const serviceRadius = new Graphics();
      serviceRadius
        .circle(0, 0, options.refuelRange ?? 0)
        .stroke({
          color: 0x8df7cb,
          width: 2,
          alpha: 0.34,
        });
      sprite.addChild(serviceRadius);
    }

    if (hasFuelLane) {
      const laneRadius = options.refuelLaneRadius ?? 0;
      const laneThickness = Math.max(24, options.refuelLaneThickness ?? 160);
      const fuelLane = new Graphics();
      fuelLane
        .circle(0, 0, laneRadius)
        .stroke({
          color: 0x8df7cb,
          width: Math.max(2, laneThickness * 0.12),
          alpha: 0.26,
        });
      sprite.addChild(fuelLane);
    }
  }

  if (options.showBodyMarker !== false) {
    const markerRadius = Math.max(options.bodyRadius * 0.92, 8);
    const marker = new Graphics();
    marker
      .circle(0, 0, markerRadius)
      .fill({
        color: 0x08130f,
        alpha: 0.68,
      })
      .stroke({
        color: 0x89ffd0,
        width: Math.max(markerRadius * 0.18, 1.6),
        alpha: 0.96,
      });
    marker
      .rect(-markerRadius * 0.16, -markerRadius * 0.72, markerRadius * 0.32, markerRadius * 1.44)
      .fill(0x89ffd0);
    marker
      .rect(-markerRadius * 0.72, -markerRadius * 0.16, markerRadius * 1.44, markerRadius * 0.32)
      .fill(0x89ffd0);
    sprite.addChild(marker);
  }
}

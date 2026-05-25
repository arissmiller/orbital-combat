import { Graphics } from "pixi.js";

export interface InterceptorSpriteStyle {
  fillColor?: number;
  strokeColor?: number;
  strokeWidth?: number;
  strokeAlpha?: number;
}

export function createInterceptorSprite(
  style: InterceptorSpriteStyle = {},
): Graphics {
  const sprite = new Graphics();
  paintInterceptorSprite(sprite, style);
  return sprite;
}

export function paintInterceptorSprite(
  sprite: Graphics,
  style: InterceptorSpriteStyle = {},
): void {
  sprite.clear();
  sprite
    .poly([
      0, -18,
      14, 12,
      0, 6,
      -14, 12,
    ])
    .fill(style.fillColor ?? 0xffc857);

  const strokeWidth = style.strokeWidth ?? 0;
  if (style.strokeColor !== undefined && strokeWidth > 0) {
    sprite.stroke({
      color: style.strokeColor,
      width: strokeWidth,
      alpha: style.strokeAlpha ?? 0.95,
    });
  }
}


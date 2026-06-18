import type { Vector2Like } from "../physics/vector2";
import type { SceneCameraOverride } from "../scenes/scene-camera";

export interface CameraFrame {
  center: Vector2Like;
  zoom: number;
}

export function computeCameraFrame(options: {
  screenWidth: number;
  screenHeight: number;
  focusPoints: readonly Vector2Like[];
  padding: number;
  minZoom: number;
  maxZoom: number;
}): CameraFrame {
  if (options.focusPoints.length === 0) {
    return {
      center: { x: 0, y: 0 },
      zoom: 1,
    };
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of options.focusPoints) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  const width = Math.max(maxX - minX, 240);
  const height = Math.max(maxY - minY, 240);
  const paddedWidth = width + options.padding * 2;
  const paddedHeight = height + options.padding * 2;
  const zoom = Math.min(
    options.maxZoom,
    Math.max(
      options.minZoom,
      Math.min(
        options.screenWidth / paddedWidth,
        options.screenHeight / paddedHeight,
      ),
    ),
  );

  return {
    center: {
      x: (minX + maxX) * 0.5,
      y: (minY + maxY) * 0.5,
    },
    zoom,
  };
}

export function updatePrototypeCamera(options: {
  currentCenter: Vector2Like;
  currentZoom: number;
  cameraFrame: CameraFrame;
  shipPosition: Vector2Like;
  screenWidth: number;
  screenHeight: number;
  tacticalViewActive: boolean;
  missionVisible: boolean;
  hudVisible: boolean;
  isCrashed: boolean;
  sceneCameraOverride: SceneCameraOverride | null;
}): CameraFrame {
  const activeSceneCameraOverride =
    options.isCrashed ? null : options.sceneCameraOverride;
  const cameraTargetCenter = activeSceneCameraOverride
    ? activeSceneCameraOverride.center
    : options.tacticalViewActive
      ? options.cameraFrame.center
      : options.cameraFrame.center;
  const cameraTargetZoom = activeSceneCameraOverride
    ? activeSceneCameraOverride.zoom
    : options.cameraFrame.zoom;
  const cameraZoomLerp =
    activeSceneCameraOverride?.zoomLerp ??
    (options.tacticalViewActive ? 0.08 : 0.12);
  const cameraPositionLerp =
    activeSceneCameraOverride?.positionLerp ??
    (options.tacticalViewActive ? 0.08 : 0.14);
  let nextZoom =
    options.currentZoom +
    (cameraTargetZoom - options.currentZoom) * cameraZoomLerp;
  let nextCenter = {
    x:
      options.currentCenter.x +
      (cameraTargetCenter.x - options.currentCenter.x) * cameraPositionLerp,
    y:
      options.currentCenter.y +
      (cameraTargetCenter.y - options.currentCenter.y) * cameraPositionLerp,
  };

  if (!activeSceneCameraOverride) {
    nextCenter = constrainCameraCenterToSafeBox({
      cameraCenter: nextCenter,
      cameraZoom: nextZoom,
      shipPosition: options.shipPosition,
      screenWidth: options.screenWidth,
      screenHeight: options.screenHeight,
      tacticalViewActive: options.tacticalViewActive,
      missionVisible: options.missionVisible,
      hudVisible: options.hudVisible,
    });
  }

  return {
    center: nextCenter,
    zoom: nextZoom,
  };
}

function constrainCameraCenterToSafeBox(options: {
  cameraCenter: Vector2Like;
  cameraZoom: number;
  shipPosition: Vector2Like;
  screenWidth: number;
  screenHeight: number;
  tacticalViewActive: boolean;
  missionVisible: boolean;
  hudVisible: boolean;
}): Vector2Like {
  if (!options.hudVisible || options.cameraZoom <= 0.0001) {
    return options.cameraCenter;
  }

  const safeBox = getCameraSafeBox(options);
  const screenCenter = {
    x: options.screenWidth * 0.5,
    y: options.screenHeight * 0.5,
  };
  const shipScreenX =
    screenCenter.x +
    (options.shipPosition.x - options.cameraCenter.x) * options.cameraZoom;
  const shipScreenY =
    screenCenter.y +
    (options.shipPosition.y - options.cameraCenter.y) * options.cameraZoom;
  let adjustedCenterX = options.cameraCenter.x;
  let adjustedCenterY = options.cameraCenter.y;

  if (shipScreenX < safeBox.minX) {
    adjustedCenterX -= (safeBox.minX - shipScreenX) / options.cameraZoom;
  } else if (shipScreenX > safeBox.maxX) {
    adjustedCenterX += (shipScreenX - safeBox.maxX) / options.cameraZoom;
  }

  if (shipScreenY < safeBox.minY) {
    adjustedCenterY -= (safeBox.minY - shipScreenY) / options.cameraZoom;
  } else if (shipScreenY > safeBox.maxY) {
    adjustedCenterY += (shipScreenY - safeBox.maxY) / options.cameraZoom;
  }

  return {
    x: adjustedCenterX,
    y: adjustedCenterY,
  };
}

function getCameraSafeBox(options: {
  screenWidth: number;
  screenHeight: number;
  tacticalViewActive: boolean;
  missionVisible: boolean;
}): { minX: number; maxX: number; minY: number; maxY: number } {
  const topPadding = 84;
  const rightPadding = options.tacticalViewActive ? 88 : 76;
  const bottomPadding = options.tacticalViewActive
    ? Math.min(210, options.screenHeight * 0.22)
    : Math.min(236, options.screenHeight * 0.27);
  const missionClearance = options.missionVisible
    ? Math.min(470, Math.max(320, options.screenWidth * 0.34))
    : 72;
  const minX = missionClearance;
  const maxX = options.screenWidth - rightPadding;
  const minY = topPadding;
  const maxY = options.screenHeight - bottomPadding;

  return {
    minX: clamp(minX, 48, options.screenWidth - 180),
    maxX: clamp(maxX, 180, options.screenWidth - 48),
    minY: clamp(minY, 48, options.screenHeight - 160),
    maxY: clamp(maxY, 160, options.screenHeight - 48),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

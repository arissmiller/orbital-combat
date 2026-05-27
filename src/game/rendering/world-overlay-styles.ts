export const WORLD_OVERLAY_STYLES = {
  forecast: {
    coast: {
      color: 0x6ef2ff,
      width: 6,
      alpha: 0.58,
      hazardAlpha: 0.82,
      markerRadius: 3,
    },
    burn: {
      width: 6,
      alpha: 0.82,
      hazardAlpha: 0.9,
      markerRadius: 4,
    },
    boost: {
      color: 0xffd166,
      width: 6,
      alpha: 0.58,
      hazardAlpha: 0.86,
      markerRadius: 3,
      dashLength: 28,
      gapLength: 18,
    },
    confidence: {
      high: {
        alphaScale: 1,
        widthScale: 1,
        markerRadiusScale: 1,
      },
      medium: {
        alphaScale: 0.82,
        widthScale: 0.92,
        markerRadiusScale: 0.94,
      },
      low: {
        alphaScale: 0.68,
        widthScale: 0.84,
        markerRadiusScale: 0.86,
        dashLength: 18,
        gapLength: 14,
      },
      unstable: {
        alphaScale: 0.52,
        widthScale: 0.72,
        markerRadiusScale: 0.72,
        dashLength: 10,
        gapLength: 12,
      },
    },
  },
  forceVector: {
    color: 0xfff28a,
    width: 2.8,
    alpha: 0.92,
    headLength: 13,
    minimumLength: 26,
    maximumLength: 118,
    lengthScale: 22,
    baseRingRadius: 10,
  },
  engineCompass: {
    radius: 38,
    innerRadius: 24,
    scaleMin: 1,
    scaleMax: 1.6,
    ringColor: 0xffdd9e,
    ringWidth: 3,
    ringAlpha: 0.42,
    innerRingAlpha: 0.16,
    tickWidth: 3,
    tickAlpha: 0.72,
    majorTickLength: 8,
    minorTickLength: 6,
    progradeMarkerColor: 0xfff6d7,
    progradeMarkerAlpha: 0.96,
    progradeMarkerLength: 10,
    progradeMarkerInset: 2,
    progradeMarkerWidth: 6,
    arrowColor: 0xfff3c9,
    arrowWidth: 2.6,
    arrowAlpha: 0.94,
    arrowMinimumLength: 14,
    arrowMaximumLength: 27,
    headLength: 8,
    headWidth: 5,
    centerRadius: 3,
    boostHaloWidth: 1.4,
    boostHaloAlpha: 0.54,
    gravityColor: 0x7fd6ff,
    gravityWidth: 2.2,
    gravityAlpha: 0.84,
    gravityLength: 22,
    gravityHeadLength: 7,
    gravityHeadWidth: 4,
    cloaked: {
      ringColor: 0x9aa6b4,
      ringAlpha: 0.52,
      tickAlpha: 0.62,
      markerColor: 0xc9d2dc,
      markerAlpha: 0.88,
      arrowColor: 0xc1c9d2,
      arrowAlpha: 0.78,
      slashColor: 0x7f8b99,
      slashWidth: 5,
      slashAlpha: 0.86,
      chargeColor: 0xb9c2cb,
      chargeAlpha: 0.62,
      chargeWidth: 2.6,
      chargeRadiusOffset: 8,
    },
  },
  orbitalGuides: {
    rootRingRadii: [2.8, 4.8, 7.8],
    childRingRadii: [2.2, 3.8, 5.8],
    rootColor: 0x7db8ff,
    childColor: 0xc8d6ff,
    rootAlpha: 0.14,
    childAlpha: 0.09,
    firstRingWidth: 1.4,
    otherRingWidth: 1,
    alphaDecayPerRing: 0.22,
    orbitTrace: {
      pointCount: 132,
      color: 0xffffff,
      width: 2,
      alpha: 0.75,
      dashLength: 20,
      gapLength: 14,
    },
  },
  gravityWellBoundary: {
    color: 0xffe39c,
    width: 1.8,
    alpha: 0.46,
    dashCount: 42,
    dashCoverage: 0.54,
  },
  guidanceFidelityMesh: {
    color: 0xa9e8ff,
    fullSimulationColor: 0xffd2a3,
    lineWidth: 1,
    baseAlpha: 0.03,
    maxAlpha: 0.16,
    fullSimulationAlpha: 0.22,
    minVisibleFidelity: 0.05,
    displacementScale: 0.075,
    maxDisplacementFraction: 0.24,
    maxColumns: 40,
    maxRows: 28,
    minSampleSpacing: 60,
  },
  trainingMissionArea: {
    accentColor: 0x8ef7ff,
    gateSegmentCoverage: 0.72,
    bracketSegmentCoverage: 0.38,
    orbitBand: {
      outerWidth: 3,
      innerWidth: 2,
      centerWidth: 2.5,
      innerRingWidth: 1.2,
    },
  },
  scannerRadius: {
    shellColor: 0x66f5ff,
    shellSteps: 2,
    shellAlpha: 0.03,
    rimColor: 0x66f5ff,
    rimWidth: 1.5,
    rimAlpha: 0.18,
    occlusionColor: 0x02050b,
    occlusionAlpha: 0.34,
  },
  weaponRange: {
    armed: {
      shellSteps: 5,
      shellAlpha: 0.16,
      rimWidth: 1.5,
      rimAlpha: 0.28,
    },
    safe: {
      dashCount: 32,
      dashCoverage: 0.52,
      width: 1.8,
      alpha: 0.42,
    },
  },
  shieldBubble: {
    innerWidth: 1.4,
    outerWidth: 1.6,
    outerFlashWidth: 1.4,
    shellSteps: 5,
    fillColor: 0x4bbcff,
  },
  dashedCircle: {
    defaultCap: "round" as const,
  },
  defenseSensorRanges: {
    beam: {
      width: 1.5,
      idleColor: 0xffc7a0,
      activeColor: 0xff9a7b,
    },
    torpedo: {
      fillIdleColor: 0xffc7a0,
      fillActiveColor: 0xff9a7b,
      rimWidth: 1.5,
      progressWidth: 2.2,
      progressColor: 0xff7a5a,
      occluderOutlineColor: 0x03060c,
      occluderOutlineWidth: 3.2,
      occluderOutlineAlpha: 0.5,
    },
  },
  defenseScannerCones: {
    fillColor: 0xff8d6b,
    fillAlpha: 0.06,
    strokeColor: 0xffb08a,
    strokeWidth: 1.2,
    strokeAlpha: 0.22,
  },
  interceptReticle: {
    lockedColor: 0xff8461,
    unlockedColor: 0xffc9a6,
    outerWidth: 1.4,
    innerWidth: 1,
    armWidth: 1.8,
  },
  defenseLock: {
    lockedColor: 0xff7d66,
    scanningColor: 0xa2f3ff,
    lockedWidth: 2.2,
    scanningWidth: 1.7,
    ringWidth: 1.1,
  },
  torpedoLock: {
    lockedColor: 0xff8d6a,
    scanningColor: 0xa2f3ff,
    frameWidth: 1.6,
    interceptLineWidth: 1,
    interceptLineAlpha: 0.28,
  },
  disintegratorEngagement: {
    safe: {
      disintegratorColor: 0xff6a6a,
      disruptorColor: 0x9dacff,
    },
    armed: {
      disintegrator: {
        outerColor: 0xff2f2f,
        glowColor: 0xff4b4b,
        rimColor: 0xff8c8c,
        coreColor: 0xff4f4f,
      },
      disruptor: {
        outerColor: 0x4658ff,
        glowColor: 0x6e7eff,
        rimColor: 0xc6ceff,
        coreColor: 0x9ba8ff,
      },
    },
  },
  hostileBeam: {
    outerColor: 0xff3b7e,
    coreColor: 0xff8ca8,
  },
  scannerContacts: {
    strokeColor: 0xd7f8ff,
    strokeWidth: 1.5,
    strokeAlpha: 0.55,
    fillAlpha: 0.9,
  },
  likelyEnemyContact: {
    color: 0xffbe78,
    width: 1.5,
    alpha: 0.76,
    innerAlpha: 0.34,
    pingAlpha: 0.22,
    pingRadius: 12,
  },
  enemyClassStyles: {
    surfaceLauncher: {
      contactColor: 0xffc7a0,
      contactFillAlpha: 0.9,
      sensorIdleColor: 0xffc7a0,
      sensorActiveColor: 0xff9a7b,
      sensorProgressColor: 0xff7a5a,
      likelyEnemyColor: 0xffbe78,
    },
    orbitalLauncher: {
      contactColor: 0xffd59a,
      contactFillAlpha: 0.9,
      sensorIdleColor: 0xffd59a,
      sensorActiveColor: 0xffa875,
      sensorProgressColor: 0xff8d60,
      likelyEnemyColor: 0xffcf8a,
    },
    raider: {
      contactColor: 0xffb2bf,
      contactFillAlpha: 0.88,
      sensorIdleColor: 0xffc8aa,
      sensorActiveColor: 0xffa28b,
      sensorProgressColor: 0xff8f6f,
      likelyEnemyColor: 0xffb9c9,
    },
    supportStation: {
      contactColor: 0x9eeac9,
      contactFillAlpha: 0.84,
      sensorIdleColor: 0x9eeac9,
      sensorActiveColor: 0x7ad3af,
      sensorProgressColor: 0x6fc3a1,
      likelyEnemyColor: 0x9eeac9,
    },
    trainingTarget: {
      contactColor: 0xffdfa3,
      contactFillAlpha: 0.82,
      sensorIdleColor: 0xffdfa3,
      sensorActiveColor: 0xffc984,
      sensorProgressColor: 0xffb366,
      likelyEnemyColor: 0xffdfa3,
    },
    unknown: {
      contactColor: 0xd7f8ff,
      contactFillAlpha: 0.9,
      sensorIdleColor: 0xffc7a0,
      sensorActiveColor: 0xff9a7b,
      sensorProgressColor: 0xff7a5a,
      likelyEnemyColor: 0xffbe78,
    },
  },
} as const;

export function getBurnForecastColor(label: string, hasHazard: boolean): number {
  if (hasHazard) {
    return 0xffd166;
  }

  if (label.includes("+")) {
    return 0x8fe7ff;
  }

  if (label === "Prograde") {
    return 0x7dff8f;
  }

  if (label === "Retrograde") {
    return 0xff7d7d;
  }

  if (label === "Radial out") {
    return 0xb1ff74;
  }

  return 0xffb074;
}

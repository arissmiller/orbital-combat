import { logDevEvent } from "../../dev/runtime-log";
import type { MixableAudioBusName } from "./audio-mixer";
import type { AudioSampleConfig } from "./sample-player";

export interface AudioAssetDefinition extends Required<AudioSampleConfig> {
  id: string;
  category: string;
  fileName: string;
  sourcePath: string;
  url: string;
}

const AUDIO_ASSET_PATH_MARKER = "/assets/audio/";
const ASSETS_PATH_MARKER = "/assets/";
const DEFAULT_AUDIO_ASSET_CONFIG: Required<AudioSampleConfig> = {
  bus: "ui",
  gain: 1,
  playbackRate: 1,
  loop: false,
};

const CATEGORY_BUS_MAP: Readonly<Record<string, MixableAudioBusName>> = {
  ui: "ui",
  warnings: "warnings",
  weapons: "weapons",
  engines: "engines",
  background: "background",
  ambience: "ambience",
  music: "music",
};

const DISCOVERED_AUDIO_ASSET_MODULES = import.meta.glob(
  [
    "../../assets/audio/**/*.{wav,mp3,ogg,m4a,aac,flac}",
    "../../assets/*.{wav,mp3,ogg,m4a,aac,flac}",
  ],
  {
    eager: true,
    import: "default",
  },
) as Record<string, string>;

export const AUDIO_ASSET_DEFINITIONS: Record<string, AudioAssetDefinition> =
  discoverAudioAssetDefinitions();

export function resolveWarningAudioAssetId(warningId: string): string {
  return `warnings/${warningId}`.toLowerCase();
}

function discoverAudioAssetDefinitions(): Record<string, AudioAssetDefinition> {
  const definitionsById = new Map<string, AudioAssetDefinition>();
  const sortedEntries = Object.entries(DISCOVERED_AUDIO_ASSET_MODULES)
    .slice()
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [sourcePath, url] of sortedEntries) {
    const normalizedPath = sourcePath.replace(/\\/g, "/");
    const markerIndex = normalizedPath.lastIndexOf(AUDIO_ASSET_PATH_MARKER);
    const legacyMarkerIndex = normalizedPath.lastIndexOf(ASSETS_PATH_MARKER);
    let relativePath = "";
    let category: string | null = null;

    if (markerIndex >= 0) {
      relativePath = normalizedPath.slice(
        markerIndex + AUDIO_ASSET_PATH_MARKER.length,
      );
    } else if (legacyMarkerIndex >= 0) {
      relativePath = normalizedPath.slice(
        legacyMarkerIndex + ASSETS_PATH_MARKER.length,
      );
      category = "warnings";
    } else {
      continue;
    }

    const pathSegments = relativePath.split("/").filter(Boolean);

    if (category === null) {
      if (pathSegments.length >= 2) {
        category = pathSegments[0].toLowerCase();
      } else if (pathSegments.length === 1) {
        // Root-level audio assets default to background so quick drops like
        // `src/assets/audio/track.wav` are immediately usable for ambience loops.
        category = "background";
      } else {
        continue;
      }
    }
    const fileName = pathSegments[pathSegments.length - 1];
    const extensionMatch = /\.([^.]+)$/.exec(fileName);

    if (!extensionMatch) {
      continue;
    }

    const extension = extensionMatch[0];
    const baseName = fileName.slice(0, -extension.length);

    if (!baseName) {
      continue;
    }

    const assetSlug = normalizeAssetSlug(baseName);
    if (!assetSlug) {
      continue;
    }

    const assetId = `${category}/${assetSlug}`.toLowerCase();
    if (definitionsById.has(assetId)) {
      logDevEvent(
        "warn",
        "audio-asset-registry",
        `Duplicate audio asset id "${assetId}" detected; keeping the first match.`,
        {
          details: {
            ignoredSourcePath: sourcePath,
          },
        },
      );
      continue;
    }

    definitionsById.set(assetId, {
      id: assetId,
      category,
      fileName,
      sourcePath,
      url,
      bus: CATEGORY_BUS_MAP[category] ?? DEFAULT_AUDIO_ASSET_CONFIG.bus,
      gain: DEFAULT_AUDIO_ASSET_CONFIG.gain,
      playbackRate: DEFAULT_AUDIO_ASSET_CONFIG.playbackRate,
      loop: DEFAULT_AUDIO_ASSET_CONFIG.loop,
    });
  }

  return Object.fromEntries(definitionsById.entries());
}

function normalizeAssetSlug(baseName: string): string {
  return baseName
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/_+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

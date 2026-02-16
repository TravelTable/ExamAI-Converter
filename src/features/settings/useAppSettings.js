import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "examAI:settings";

export const DEFAULT_MODEL = "gpt-4.1";
export const DEFAULT_TTS_VOICE = "alloy";
export const VOICES = [
  { id: "alloy", label: "Alloy (neutral, clear)" },
  { id: "verse", label: "Verse (warm, natural)" },
  { id: "sage", label: "Sage (calm, low)" },
  { id: "serene", label: "Serene (soft, breathy)" },
  { id: "charlie", label: "Charlie (bright, energetic)" },
  { id: "shimmer", label: "Shimmer (crisp, lively)" }
];

export const DEFAULT_SETTINGS = {
  providerMode: "direct",
  cometApiKey: "",
  backendBaseUrl: "",
  backendAuthToken: "",
  model: DEFAULT_MODEL,
  ttsVoice: DEFAULT_TTS_VOICE,
  saveKey: false,
  enableTutorWebSearch: true,
  searchContextSize: "medium",
  voiceOutputMode: "browser"
};

export function migrateSettings(raw) {
  const parsed = raw && typeof raw === "object" ? raw : {};

  const isLegacy = Object.prototype.hasOwnProperty.call(parsed, "apiKey");

  const migrated = {
    ...DEFAULT_SETTINGS,
    ...parsed,
    providerMode: parsed.providerMode === "proxy" ? "proxy" : "direct",
    cometApiKey: parsed.cometApiKey || "",
    backendBaseUrl: parsed.backendBaseUrl || "",
    backendAuthToken: parsed.backendAuthToken || "",
    model: parsed.model || DEFAULT_MODEL,
    ttsVoice: parsed.ttsVoice || DEFAULT_TTS_VOICE,
    saveKey: Boolean(parsed.saveKey),
    enableTutorWebSearch:
      typeof parsed.enableTutorWebSearch === "boolean"
        ? parsed.enableTutorWebSearch
        : true,
    searchContextSize: ["low", "medium", "high"].includes(parsed.searchContextSize)
      ? parsed.searchContextSize
      : "medium",
    voiceOutputMode: ["browser", "api"].includes(parsed.voiceOutputMode)
      ? parsed.voiceOutputMode
      : "browser"
  };

  if (isLegacy && !migrated.cometApiKey && typeof parsed.apiKey === "string") {
    migrated.cometApiKey = parsed.apiKey;
    migrated.providerMode = "direct";
  }

  return migrated;
}

function toPersistedSettings(settings) {
  if (settings.saveKey) return settings;
  return {
    ...settings,
    cometApiKey: "",
    backendAuthToken: ""
  };
}

export function useAppSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let next = DEFAULT_SETTINGS;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      next = migrateSettings(raw ? JSON.parse(raw) : {});
    } catch {
      next = DEFAULT_SETTINGS;
    }
    setSettings(next);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersistedSettings(settings)));
    } catch {
      /* ignore */
    }
  }, [settings, loaded]);

  const updateSettings = (patch) => {
    setSettings((prev) => {
      const nextPatch = typeof patch === "function" ? patch(prev) : patch;
      return { ...prev, ...nextPatch };
    });
  };

  const hasStoredSecrets = useMemo(() => {
    if (!loaded) return false;
    return Boolean(settings.saveKey && (settings.cometApiKey || settings.backendAuthToken));
  }, [settings, loaded]);

  const clearStoredSecrets = () => {
    setSettings((prev) => ({
      ...prev,
      cometApiKey: "",
      backendAuthToken: "",
      saveKey: false
    }));
  };

  return {
    settings,
    setSettings: updateSettings,
    loaded,
    hasStoredSecrets,
    clearStoredSecrets
  };
}

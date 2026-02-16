import { migrateSettings } from "./useAppSettings";

test("migrates legacy settings to comet schema", () => {
  const migrated = migrateSettings({
    apiKey: "legacy-key",
    model: "gpt-4o",
    ttsVoice: "alloy",
    saveKey: true
  });

  expect(migrated.providerMode).toBe("direct");
  expect(migrated.cometApiKey).toBe("legacy-key");
  expect(migrated.model).toBe("gpt-4o");
  expect(migrated.enableTutorWebSearch).toBe(true);
  expect(migrated.voiceOutputMode).toBe("browser");
});

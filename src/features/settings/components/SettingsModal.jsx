import { AlertTriangle, Settings, X } from "lucide-react";

export default function SettingsModal({
  settings,
  setSettings,
  onClose,
  onSave,
  onDeleteKey,
  settingsSaved,
  tokenUsage,
  onResetSession,
  models,
  validationError
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl p-8 relative max-h-[92vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-4 flex items-center">
          <Settings className="h-6 w-6 mr-2" />
          Settings
        </h2>
        <div className="absolute top-0 right-0 p-4">
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="mb-4">
          <label htmlFor="providerMode" className="block font-medium text-gray-700 mb-1">
            Connection Mode
          </label>
          <select
            id="providerMode"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
            value={settings.providerMode}
            onChange={(e) => setSettings({ providerMode: e.target.value })}
          >
            <option value="direct">Direct Comet API Key</option>
            <option value="proxy">External Backend Proxy</option>
          </select>
        </div>

        {settings.providerMode === "direct" ? (
          <div className="mb-4">
            <label htmlFor="cometApiKey" className="block font-medium text-gray-700 mb-1">
              Comet API Key
            </label>
            <input
              id="cometApiKey"
              type="password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
              value={settings.cometApiKey}
              onChange={(e) => setSettings({ cometApiKey: e.target.value })}
              autoComplete="off"
            />
            <div className="text-xs text-gray-500 mt-1">
              Stored locally only when "Save key" is enabled.
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label htmlFor="backendBaseUrl" className="block font-medium text-gray-700 mb-1">
                Backend Base URL
              </label>
              <input
                id="backendBaseUrl"
                type="text"
                placeholder="https://your-backend.example.com"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
                value={settings.backendBaseUrl}
                onChange={(e) => setSettings({ backendBaseUrl: e.target.value })}
              />
            </div>
            <div className="mb-4">
              <label htmlFor="backendAuthToken" className="block font-medium text-gray-700 mb-1">
                Backend Auth Token
              </label>
              <input
                id="backendAuthToken"
                type="password"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
                value={settings.backendAuthToken}
                onChange={(e) => setSettings({ backendAuthToken: e.target.value })}
                autoComplete="off"
              />
            </div>
          </>
        )}

        <div className="mb-4">
          <label htmlFor="model" className="block font-medium text-gray-700 mb-1">
            Model
          </label>
          <select
            id="model"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
            value={settings.model}
            onChange={(e) => setSettings({ model: e.target.value })}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div>
            <label htmlFor="voice" className="block font-medium text-gray-700 mb-1">
              Voice
            </label>
            <select
              id="voice"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
              value={settings.ttsVoice}
              onChange={(e) => setSettings({ ttsVoice: e.target.value })}
            >
              <option value="alloy">Alloy</option>
              <option value="verse">Verse</option>
              <option value="sage">Sage</option>
              <option value="serene">Serene</option>
              <option value="charlie">Charlie</option>
              <option value="shimmer">Shimmer</option>
            </select>
          </div>
          <div>
            <label htmlFor="voiceMode" className="block font-medium text-gray-700 mb-1">
              Voice Output
            </label>
            <select
              id="voiceMode"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
              value={settings.voiceOutputMode}
              onChange={(e) => setSettings({ voiceOutputMode: e.target.value })}
            >
              <option value="browser">Browser TTS (default)</option>
              <option value="api">API TTS (fallback to browser)</option>
            </select>
          </div>
          <div>
            <label htmlFor="searchContextSize" className="block font-medium text-gray-700 mb-1">
              Search Context
            </label>
            <select
              id="searchContextSize"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500"
              value={settings.searchContextSize}
              onChange={(e) => setSettings({ searchContextSize: e.target.value })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center text-gray-700">
              <input
                type="checkbox"
                className="mr-2"
                checked={settings.enableTutorWebSearch}
                onChange={(e) => setSettings({ enableTutorWebSearch: e.target.checked })}
              />
              Enable Tutor Web Search
            </label>
          </div>
        </div>

        <div className="mb-4 flex items-center">
          <input
            id="saveKey"
            type="checkbox"
            checked={settings.saveKey}
            onChange={(e) => setSettings({ saveKey: e.target.checked })}
            className="mr-2"
          />
          <label htmlFor="saveKey" className="text-gray-700">
            Save key/token to this browser
          </label>
          <span className="ml-3 text-xs text-gray-500">
            {settings.saveKey ? (settingsSaved ? "Saved" : "Saving...") : "Not saved"}
          </span>
        </div>

        {validationError && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-2">
            {validationError}
          </div>
        )}

        <div className="mb-4">
          <button
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition font-medium mr-2"
            onClick={onSave}
          >
            Save Settings
          </button>
          <button
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition font-medium"
            onClick={onDeleteKey}
          >
            Clear stored key/token
          </button>
        </div>

        <div className="mb-4">
          <div className="text-xs text-gray-500">
            <span className="font-bold">Estimated tokens this session:</span> {tokenUsage.session}
            <button className="ml-2 text-indigo-600 underline" onClick={onResetSession}>
              Reset Session
            </button>
          </div>
        </div>

        <div className="mb-2">
          <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded text-xs font-bold flex items-center">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Direct mode exposes secrets to this browser. Use proxy mode for stronger key security.
          </div>
        </div>
      </div>
    </div>
  );
}

import { CyberGamePayload } from './networkSerializer';

const API_BASE = 'http://localhost:4545';

export const fetchPresets = async (): Promise<Record<string, CyberGamePayload>> => {
  const response = await fetch(`${API_BASE}/api/presets`);
  if (!response.ok) {
    let message = `Failed to fetch presets (HTTP ${response.status})`;
    try {
      const body = await response.json();
      if (body?.error) message = `${body.error as string} (HTTP ${response.status})`;
    } catch {
      // use default message
    }
    throw new Error(message);
  }
  return response.json();
};

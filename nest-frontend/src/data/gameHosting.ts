import { Game } from './games';
import { loadNetworkSnapshot } from './networkStorage';
import { CyberGamePayload, serializeNetworkToCyberGame, CyberGameDevice } from './networkSerializer';
import { fetchPresets } from './presets';

const API_BASE = 'http://localhost:4545';

export type HostedGameStatus = {
  id: number;
  name: string;
  status: string;
  updatedAt?: string;
  startedAt?: string;
  gameId: string;
};

type BackendGameStatus = {
  id: number;
  name: string;
  status: string;
  updatedAt?: string;
  startedAt?: string;
};

/**
 * Stops a running game and triggers terraform destroy via the backend.
 * Matches backend endpoint: POST /api/games/:id/stop
 */
export const destroyHostedGame = async (hostedGameId: number): Promise<void> => {
  const response = await fetch(`${API_BASE}/api/games/${hostedGameId}/stop`, {
    method: 'POST',
  });
  if (!response.ok) {
    let message = `Failed to destroy game infrastructure (HTTP ${response.status})`;
    try {
      const body = await response.json();
      if (body?.error) message = `${body.error as string} (HTTP ${response.status})`;
    } catch {
      // use default message
    }
    throw new Error(message);
  }
};

/**
 * Fetches the current status of a game from the backend.
 * Matches backend endpoint: GET /api/games/:id/status
 */
export const fetchGameStatus = async (
  hostedGameId: number,
): Promise<HostedGameStatus> => {
  const response = await fetch(`${API_BASE}/api/games/${hostedGameId}/status`);
  if (!response.ok) {
    let message = `Failed to fetch game status (HTTP ${response.status})`;
    try {
      const body = await response.json();
      if (body?.error) message = `${body.error as string} (HTTP ${response.status})`;
    } catch {
      // use default message
    }
    throw new Error(message);
  }
  const data = (await response.json()) as BackendGameStatus;
  return {
    id: data.id,
    name: data.name,
    status: data.status,
    updatedAt: data.updatedAt,
    startedAt: data.startedAt,
    gameId: '',
  };
};

/**
 * Opens an SSE connection to stream terraform logs from the backend.
 * Matches backend endpoint: GET /api/games/:id/logs
 *
 * Returns an EventSource that the caller should close when done.
 * Each 'message' event contains a log line in event.data.
 * A 'close' event is sent when the stream ends.
 */
export const streamTerraformLogs = (
  hostedGameId: number,
  onMessage: (line: string) => void,
  onClose?: () => void,
  onError?: (error: Event) => void,
): EventSource => {
  const source = new EventSource(`${API_BASE}/api/games/${hostedGameId}/logs`);

  source.onmessage = (event) => {
    onMessage(event.data);
  };

  source.addEventListener('close', () => {
    source.close();
    onClose?.();
  });

  source.onerror = (event) => {
    onError?.(event);
    // EventSource auto-reconnects on error, but if the stream
    // was intentionally closed server-side the readyState will be CLOSED
    if (source.readyState === EventSource.CLOSED) {
      onClose?.();
    }
  };

  return source;
};

/**
 * Builds the CyberGame payload from the network editor snapshot.
 * Falls back to a minimal payload if no network snapshot exists.
 */
const buildPayloadFromNetwork = (
  game: Game,
  teamCount: number,
): CyberGamePayload => {
  const snapshot = loadNetworkSnapshot(game.id);

  if (snapshot && snapshot.nodes.length > 0) {
    return serializeNetworkToCyberGame(snapshot, game, teamCount);
  }

  // Fallback: no network configured, send minimal payload
  return {
    networks: [],
    devices: [],
    blackteamServices: (game.rvbServices || []).map((service, index) => ({
      name: service,
      templateId: index + 1,
      hostId: index + 1,
      ip: `10.0.0.${index + 10}`,
    })),
    applications: game.types.map((type, index) => ({
      name: `${game.name} - ${type}`,
      servers: [],
      services: [],
      color: ['#E11D48', '#2563EB', '#10B981'][index % 3],
    })),
  };
};

/**
 * Sends the game's network configuration to the backend to create
 * infrastructure via terraform. Uses the network editor snapshot data.
 *
 * Matches backend endpoint: POST /api/games
 */
export const hostGameInstance = async (
  game: Game,
  options?: { teamCount?: number },
): Promise<HostedGameStatus> => {
  const teamCount = options?.teamCount ?? game.teamCount ?? 2;

  let payload: CyberGamePayload;

  if (game.presetId) {
    const presets = await fetchPresets();
    const preset = presets[game.presetId];
    if (!preset) {
      throw new Error(`Preset "${game.presetId}" not found.`);
    }

    const serverNames = preset.devices
      .filter((d: CyberGameDevice) => d.type === 'Server')
      .map((d: CyberGameDevice) => d.name);

    const applications = game.types.map((type, index) => ({
      name: `${game.name} - ${type}`,
      servers: serverNames,
      services: [],
      color: ['#E11D48', '#2563EB', '#10B981'][index % 3],
    }));

    payload = {
      ...preset,
      applications,
    };
  } else {
    payload = buildPayloadFromNetwork(game, teamCount);
  }

  const response = await fetch(`${API_BASE}/api/games`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `Failed to host game (HTTP ${response.status}).`;
    try {
      const body = await response.json();
      if (body?.error) message = `${body.error as string} (HTTP ${response.status})`;
    } catch {
      // use default message
    }
    throw new Error(message);
  }

  const data = (await response.json()) as BackendGameStatus;

  return {
    id: data.id,
    name: data.name,
    status: data.status,
    updatedAt: data.updatedAt,
    startedAt: data.startedAt,
    gameId: game.id,
  };
};

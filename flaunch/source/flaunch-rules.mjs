import { defineGame } from '@flayerlabs/gamemode-spec';

// The Flaunch score is computed from bounded movement inputs on the room side.
// The browser never sends a score, kill count, position, or timestamp.
export const GAME_CONFIG = Object.freeze({
  roundMs: 5 * 60 * 1000,
  checkpointMs: 10 * 1000,
  checkpointDistance: 8,
  moveSpeed: 5,
  pointsPerCheckpoint: 10,
});

const INPUT_TTL_MS = 900;
const MIN_ACTION_GAP_MS = 200;

function parseAction(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const keys = Object.keys(input);
  if (keys.length !== 2 || !keys.includes('moveX') || !keys.includes('moveZ')) return null;

  const { moveX, moveZ } = input;
  if (
    typeof moveX !== 'number' ||
    typeof moveZ !== 'number' ||
    !Number.isFinite(moveX) ||
    !Number.isFinite(moveZ) ||
    Math.abs(moveX) > 1 ||
    Math.abs(moveZ) > 1 ||
    Math.hypot(moveX, moveZ) > 1.01
  ) {
    return null;
  }
  return { moveX, moveZ };
}

export const rules = defineGame({
  id: 'riftera-beast-hunter',

  parseAction,

  initRound(config, _seed, window) {
    return {
      config,
      opensAt: window.opensAt,
      closesAt: Math.min(window.closesAt, window.opensAt + config.roundMs),
      players: {},
    };
  },

  decide(state, command) {
    switch (command.kind) {
      case 'join':
        if (state.players[command.player]) return { events: [] };
        if (command.at >= state.closesAt) return { refuse: 'riftera.round_closed' };
        return {
          events: [{
            type: 'joined',
            player: command.player,
            at: command.at,
            nextCheckpointAt: command.at + state.config.checkpointMs,
          }],
        };

      case 'leave':
        return state.players[command.player]
          ? { events: [{ type: 'left', player: command.player, at: command.at }] }
          : { events: [] };

      case 'wake':
        return { events: [] };

      case 'action': {
        const player = state.players[command.player];
        if (!player) return { refuse: 'riftera.not_joined' };
        if (command.at < state.opensAt || command.at >= state.closesAt) {
          return { refuse: 'riftera.round_closed' };
        }
        const elapsed = command.at - player.lastInputAt;
        if (elapsed < MIN_ACTION_GAP_MS) return { refuse: 'riftera.input_rate' };

        // Only the last accepted input can be replayed, and only briefly. Missing heartbeats
        // cannot claim idle time or catch up several checkpoints later.
        const distance =
          elapsed <= INPUT_TTL_MS
            ? player.distance +
              Math.hypot(player.moveX, player.moveZ) *
                state.config.moveSpeed *
                (elapsed / 1000)
            : 0;

        let award = 0;
        let nextCheckpointAt = player.nextCheckpointAt;
        let carriedDistance = distance;
        if (command.at >= nextCheckpointAt) {
          if (elapsed <= INPUT_TTL_MS && distance >= state.config.checkpointDistance) {
            award = state.config.pointsPerCheckpoint;
          }
          carriedDistance = 0;
          while (nextCheckpointAt <= command.at) {
            nextCheckpointAt += state.config.checkpointMs;
          }
        }

        const event = {
          type: 'input',
          player: command.player,
          at: command.at,
          moveX: command.action.moveX,
          moveZ: command.action.moveZ,
          distance: carriedDistance,
          nextCheckpointAt,
          points: award,
        };
        return {
          events: [event],
          ...(award > 0 ? { awards: [{ player: command.player, points: award }] } : {}),
        };
      }
    }
  },

  evolve(state, event) {
    if (event.type === 'joined') {
      return {
        ...state,
        players: {
          ...state.players,
          [event.player]: {
            points: 0,
            distance: 0,
            moveX: 0,
            moveZ: 0,
            lastInputAt: event.at,
            nextCheckpointAt: event.nextCheckpointAt,
          },
        },
      };
    }

    const player = state.players[event.player];
    if (!player) return state;

    if (event.type === 'left') {
      return {
        ...state,
        players: {
          ...state.players,
          [event.player]: { ...player, moveX: 0, moveZ: 0, lastInputAt: event.at },
        },
      };
    }

    if (event.type === 'input') {
      return {
        ...state,
        players: {
          ...state.players,
          [event.player]: {
            ...player,
            points: player.points + event.points,
            distance: event.distance,
            moveX: event.moveX,
            moveZ: event.moveZ,
            lastInputAt: event.at,
            nextCheckpointAt: event.nextCheckpointAt,
          },
        },
      };
    }

    return state;
  },

  publicView(state) {
    return {
      opensAt: state.opensAt,
      closesAt: state.closesAt,
      playerCount: Object.keys(state.players).length,
    };
  },

  playerView(state, playerId) {
    const player = state.players[playerId];
    return {
      joined: Boolean(player),
      points: player?.points ?? 0,
      distanceToCheckpoint: player?.distance ?? 0,
      nextCheckpointAt: player?.nextCheckpointAt ?? null,
    };
  },

  nextWakeAt() {
    return null;
  },

  rewardBounds(config) {
    return {
      maxPointsPerPlayer: Math.floor(config.roundMs / config.checkpointMs) * config.pointsPerCheckpoint,
    };
  },
});

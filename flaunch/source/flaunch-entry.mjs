import {
  CLIENT_MARKER,
  CLIENT_VERSION,
  connectHost,
  createMockRoom,
  joinRoom,
  spendTokenOf,
} from '@flayerlabs/gamemode-client';
import { GAME_CONFIG, rules } from './flaunch-rules.mjs';

const panel = document.createElement('aside');
panel.id = 'flaunch-mode-panel';
panel.setAttribute('role', 'status');
panel.setAttribute('aria-live', 'polite');
panel.dataset.sdk = CLIENT_MARKER;
panel.innerHTML = `
  <style>
    #flaunch-mode-panel {
      position: fixed;
      z-index: 90;
      right: max(10px, env(safe-area-inset-right));
      bottom: max(10px, env(safe-area-inset-bottom));
      width: min(245px, calc(100vw - 20px));
      box-sizing: border-box;
      padding: 10px 12px;
      border: 1px solid rgba(63, 240, 255, .38);
      border-radius: 12px;
      background: rgba(5, 8, 17, .88);
      color: #e8faff;
      box-shadow: 0 8px 30px rgba(0, 0, 0, .32);
      backdrop-filter: blur(12px);
      font: 11px/1.4 system-ui, sans-serif;
      pointer-events: auto;
    }
    #flaunch-mode-panel .fm-head { display:flex; justify-content:space-between; gap:8px; align-items:center; }
    #flaunch-mode-panel .fm-brand { color:#3ff0ff; font-weight:800; letter-spacing:.12em; }
    #flaunch-mode-panel .fm-status { color:#b8c8d6; text-align:right; }
    #flaunch-mode-panel .fm-score { margin-top:5px; font-size:13px; font-weight:700; }
    #flaunch-mode-panel .fm-progress { height:4px; margin-top:6px; overflow:hidden; border-radius:9px; background:#1d2938; }
    #flaunch-mode-panel .fm-progress span { display:block; width:0; height:100%; background:linear-gradient(90deg,#3ff0ff,#b26bff); }
    #flaunch-mode-panel .fm-note { margin-top:5px; color:#98a9b8; font-size:10px; }
    #flaunch-mode-panel button {
      display:none; width:100%; margin-top:7px; padding:7px 9px; border:0; border-radius:8px;
      background:#3ff0ff; color:#071018; font:700 11px system-ui,sans-serif; cursor:pointer;
    }
    #flaunch-mode-panel button:disabled { opacity:.55; cursor:wait; }
    @media (max-width: 520px) { #flaunch-mode-panel { width:205px; padding:8px 10px; } }
  </style>
  <div class="fm-head">
    <span class="fm-brand">FLAUNCH MODE</span>
    <span class="fm-status" id="fmStatus">Connecting…</span>
  </div>
  <div class="fm-score" id="fmScore">0 points</div>
  <div class="fm-progress" aria-label="Movement checkpoint progress"><span id="fmProgress"></span></div>
  <div class="fm-note" id="fmNote">SDK ${CLIENT_VERSION}</div>
  <button type="button" id="fmBuy">Use earned allowance</button>
`;
document.body.append(panel);

const statusLabel = panel.querySelector('#fmStatus');
const scoreLabel = panel.querySelector('#fmScore');
const progressBar = panel.querySelector('#fmProgress');
const noteLabel = panel.querySelector('#fmNote');
const buyButton = panel.querySelector('#fmBuy');
let room;
let embedded;
let isLive = false;
let sending = false;
let stopped = false;
let latestPoints = 0;

function setStatus(text) {
  statusLabel.textContent = text;
}

function formatBaseUnits(amount, decimals) {
  const scale = 10n ** BigInt(decimals);
  const whole = amount / scale;
  const fraction = (amount % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function renderEconomy() {
  if (!room || !isLive) {
    buyButton.style.display = 'none';
    return;
  }
  const available = room.economy.available();
  if (available <= 0n) {
    buyButton.style.display = 'none';
    return;
  }
  const token = spendTokenOf(room.terms.current());
  buyButton.textContent = `Use ${formatBaseUnits(available, token.decimals)} ${token.symbol}`;
  buyButton.style.display = 'block';
  buyButton.disabled = false;
}

function attachRoom(nextRoom, practice) {
  room = nextRoom;
  isLive = !practice;
  setStatus(practice ? 'PRACTICE' : 'LIVE');
  noteLabel.textContent = practice
    ? 'Local mock · no wallet or real funds'
    : `${embedded.context.launch?.symbol || 'Live round'} · SDK ${embedded.sdk}`;

  room.subscribe(({ playerView }) => {
    if (!playerView) return;
    latestPoints = playerView.points;
    scoreLabel.textContent = `${latestPoints} Flaunch points`;
    const progress = Math.min(
      100,
      (playerView.distanceToCheckpoint / GAME_CONFIG.checkpointDistance) * 100,
    );
    progressBar.style.width = `${progress}%`;
  });

  room.connection.subscribe((state) => {
    setStatus(practice ? 'PRACTICE' : String(state).toUpperCase());
  });

  room.economy.subscribe((balance) => {
    if (isLive) {
      const token = spendTokenOf(room.terms.current());
      const value = formatBaseUnits(balance.available, token.decimals);
      noteLabel.textContent = `${value} ${token.symbol} available · SDK ${embedded.sdk}`;
    }
    renderEconomy();
  });

  window.__rifteraGameModeInput = (moveX, moveZ) => {
    if (stopped || !room || sending) return;
    sending = true;
    void room
      .send({ moveX, moveZ })
      .then((result) => {
        if (!result.accepted && result.refuse !== 'riftera.input_rate') {
          console.info('[RIFTERA Game Mode] input refused:', result.refuse);
        }
      })
      .catch((error) => {
        console.warn('[RIFTERA Game Mode] room input failed:', error);
      })
      .finally(() => {
        sending = false;
      });
  };

  buyButton.addEventListener('click', async () => {
    if (!room || !isLive || room.economy.available() <= 0n) return;
    buyButton.disabled = true;
    const amount = room.economy.available();
    const result = await room.economy.buy(amount);
    buyButton.disabled = false;
    if (result.bought) {
      noteLabel.textContent = 'Purchase confirmed by the host page.';
    } else {
      noteLabel.textContent = `Purchase not completed (${result.reason}).`;
    }
    renderEconomy();
  });
}

async function bootGameMode() {
  try {
    embedded = await connectHost();
    window.__rifteraGameModeEmbedded = Boolean(embedded);

    if (embedded) {
      try {
        const liveRoom = await joinRoom({
          gateUrl: embedded.context.gateUrl,
          roundId: embedded.context.roundId,
          launch: embedded.context.launch,
          host: embedded.host,
        });
        attachRoom(liveRoom, false);
      } catch (error) {
        setStatus('LIVE ROOM ERROR');
        noteLabel.textContent = 'The game loaded, but this launch could not join its configured gate.';
        console.error('[RIFTERA Game Mode] live room unavailable:', error);
      }
      return;
    }

    attachRoom(
      createMockRoom(rules, {
        config: GAME_CONFIG,
        seed: 20261013,
        roundMs: GAME_CONFIG.roundMs,
      }),
      true,
    );
  } catch (error) {
    setStatus('SDK ERROR');
    noteLabel.textContent = 'Flaunch room could not be initialized.';
    console.error('[RIFTERA Game Mode] initialization failed:', error);
  }
}

window.addEventListener('pagehide', () => {
  stopped = true;
  if (room) room.dispose();
  if (embedded) embedded.dispose();
});

bootGameMode();

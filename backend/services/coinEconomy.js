/**
 * Economía de Monedas de Amor — modelo híbrido:
 * - Participación: monedas por jugar una partida válida (siempre, sin depender del récord)
 * - Rendimiento: monedas según puntuación, con tope por partida
 * - Récord: bonus al superar la mejor marca personal
 * - Diario: bonus en la primera partida del día (cualquier juego)
 */

export const DEFAULT_GAME_CONFIG = {
  dino: {
    divisor: 8,
    minScoreForParticipation: 15,
    participationBonus: 2,
    performanceCap: 10,
    recordBonus: 5,
  },
  tetris: {
    divisor: 40,
    minScoreForParticipation: 100,
    participationBonus: 2,
    performanceCap: 12,
    recordBonus: 5,
  },
};

export const DAILY_BONUS = 5;

const SETTING_KEYS = {
  dino_divisor: 'dino_coin_divisor',
  tetris_divisor: 'tetris_coin_divisor',
  daily_bonus: 'coin_daily_bonus',
};

export async function loadGameConfig(prisma) {
  const config = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG));

  try {
    const rows = await prisma.setting.findMany({
      where: {
        key: {
          in: Object.values(SETTING_KEYS).concat(['coin_daily_bonus']),
        },
      },
    });

    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    if (map.dino_coin_divisor) {
      const v = parseInt(map.dino_coin_divisor);
      if (!isNaN(v) && v > 0) config.dino.divisor = v;
    }
    if (map.tetris_coin_divisor) {
      const v = parseInt(map.tetris_coin_divisor);
      if (!isNaN(v) && v > 0) config.tetris.divisor = v;
    }
  } catch {
    // Si falla la lectura, se quedan los valores por defecto.
  }

  return config;
}

export function getDailyBonusFromSettings(settingsMap) {
  const v = parseInt(settingsMap?.coin_daily_bonus);
  return !isNaN(v) && v >= 0 ? v : DAILY_BONUS;
}

/**
 * Calcula monedas otorgadas por una partida.
 */
export function calculateCoins(gameKey, score, oldBest, isFirstGameToday, config, dailyBonus = DAILY_BONUS) {
  const cfg = config[gameKey];
  if (!cfg) {
    return { total: 0, breakdown: {}, isNewRecord: false };
  }

  const isNewRecord = score > oldBest;

  const participation =
    score >= cfg.minScoreForParticipation ? cfg.participationBonus : 0;

  const performance = Math.min(
    cfg.performanceCap,
    Math.floor(score / cfg.divisor)
  );

  const recordBonus = isNewRecord ? cfg.recordBonus : 0;
  const daily = isFirstGameToday ? dailyBonus : 0;

  const total = participation + performance + recordBonus + daily;

  return {
    total,
    breakdown: {
      participation,
      performance,
      recordBonus,
      daily,
    },
    isNewRecord,
  };
}

export function buildRewardMessage(breakdown, total) {
  if (total <= 0) {
    return '¡Partida registrada! Juega un poco más para ganar monedas.';
  }

  const parts = [];
  if (breakdown.participation > 0) parts.push(`+${breakdown.participation} participación`);
  if (breakdown.performance > 0) parts.push(`+${breakdown.performance} rendimiento`);
  if (breakdown.recordBonus > 0) parts.push(`+${breakdown.recordBonus} récord`);
  if (breakdown.daily > 0) parts.push(`+${breakdown.daily} bonus diario`);

  return `¡Ganaste ${total} Monedas de Amor! (${parts.join(', ')})`;
}

export function getEconomyInfo(config, dailyBonus = DAILY_BONUS) {
  return {
    dailyBonus,
    games: {
      dino: {
        label: 'Sigma Runner',
        divisor: config.dino.divisor,
        participationBonus: config.dino.participationBonus,
        performanceCap: config.dino.performanceCap,
        recordBonus: config.dino.recordBonus,
        minScore: config.dino.minScoreForParticipation,
      },
      tetris: {
        label: 'Tetris Retro',
        divisor: config.tetris.divisor,
        participationBonus: config.tetris.participationBonus,
        performanceCap: config.tetris.performanceCap,
        recordBonus: config.tetris.recordBonus,
        minScore: config.tetris.minScoreForParticipation,
      },
    },
    tips: [
      'Cada partida válida da monedas por participación y rendimiento.',
      'Superar tu récord personal otorga un bonus extra.',
      'La primera partida del día incluye un bonus diario.',
    ],
  };
}

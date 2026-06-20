export const DEFAULT_GAME_CONFIG = {
  dino: {
    divisor: 50,
    minScoreForParticipation: 50,
    participationBonus: 1,
    performanceCap: 5,
    recordBonus: 3,
  },
  tetris: {
    divisor: 300,
    minScoreForParticipation: 300,
    participationBonus: 1,
    performanceCap: 6,
    recordBonus: 3,
  },
};

export const DAILY_BONUS = 10;

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
      'Existe un límite máximo de 300 monedas semanales que puedes ganar jugando.'
    ],
  };
}

/**
 * Calcula el total de monedas ganadas en la semana actual (desde el lunes a las 00:00).
 */
export async function getWeeklyCoinsEarned(userId, prisma, config, dailyBonus = DAILY_BONUS) {
  const now = new Date();
  const day = now.getDay(); // 0 es Domingo, 1 es Lunes, etc.
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(diff);
  startOfWeek.setHours(0, 0, 0, 0);

  // Obtener todas las puntuaciones de esta semana
  const gamesThisWeek = await prisma.puntuacionJuego.findMany({
    where: {
      user_id: userId,
      created_at: { gte: startOfWeek },
    },
    orderBy: { created_at: 'asc' },
  });

  if (gamesThisWeek.length === 0) {
    return 0;
  }

  // Obtener mejor puntuación anterior al inicio de la semana para cada juego
  const preWeekScores = await prisma.puntuacionJuego.groupBy({
    by: ['game_name'],
    where: {
      user_id: userId,
      created_at: { lt: startOfWeek },
    },
    _max: { score: true },
  });

  const bestScores = {};
  for (const item of preWeekScores) {
    bestScores[item.game_name] = item._max.score || 0;
  }

  const playedDates = new Set();
  let totalEarnedThisWeek = 0;

  for (const game of gamesThisWeek) {
    const gameKey = game.game_name.toLowerCase();
    const score = game.score;
    const oldBest = bestScores[gameKey] || 0;

    const dateStr = game.created_at.toISOString().split('T')[0];
    const isFirstGameToday = !playedDates.has(dateStr);
    playedDates.add(dateStr);

    const { total } = calculateCoins(
      gameKey,
      score,
      oldBest,
      isFirstGameToday,
      config,
      dailyBonus
    );

    totalEarnedThisWeek += total;

    if (score > oldBest) {
      bestScores[gameKey] = score;
    }
  }

  return totalEarnedThisWeek;
}

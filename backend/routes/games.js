import express from 'express';
import prisma from '../prisma.js';
import { verificarUsuario } from '../middleware/auth.js';
import {
  loadGameConfig,
  calculateCoins,
  buildRewardMessage,
  getEconomyInfo,
  getDailyBonusFromSettings,
  getWeeklyCoinsEarned,
  DAILY_BONUS,
} from '../services/coinEconomy.js';
import { checkCoinsMilestone } from '../utils/milestones.js';

const router = express.Router();

router.get('/economy', async (req, res) => {
  try {
    const config = await loadGameConfig(prisma);
    const filasConfiguracion = await prisma.setting.findMany({
      where: { key: 'coin_daily_bonus' },
    });
    const mapaConfiguracion = Object.fromEntries(filasConfiguracion.map((r) => [r.key, r.value]));
    const dailyBonus = getDailyBonusFromSettings(mapaConfiguracion);

    res.json(getEconomyInfo(config, dailyBonus));
  } catch (err) {
    console.error('Error al obtener economía:', err);
    res.status(500).json({ error: 'Error al consultar la economía de monedas.' });
  }
});

router.post('/score', verificarUsuario, async (req, res) => {
  const { game_name, score } = req.body;
  const userId = req.user.id;

  if (!game_name || score === undefined || isNaN(score)) {
    return res.status(400).json({ error: 'Nombre de juego y puntuación válidos son obligatorios.' });
  }

  try {
    const gameKey = game_name.toLowerCase();
    const puntajeNuevo = parseInt(score);

    const config = await loadGameConfig(prisma);

    if (!config[gameKey]) {
      return res.status(400).json({ error: 'Juego no reconocido.' });
    }

    const mejorAnterior = await prisma.puntuacionJuego.findFirst({
      where: { user_id: userId, game_name: gameKey },
      orderBy: { score: 'desc' },
    });
    const oldBest = mejorAnterior?.score || 0;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const gamesTodayBefore = await prisma.puntuacionJuego.count({
      where: {
        user_id: userId,
        created_at: { gte: todayStart },
      },
    });
    const isFirstGameToday = gamesTodayBefore === 0;

    const filasConfiguracion = await prisma.setting.findMany({
      where: { key: 'coin_daily_bonus' },
    });
    const mapaConfiguracion = Object.fromEntries(filasConfiguracion.map((r) => [r.key, r.value]));
    const dailyBonus = getDailyBonusFromSettings(mapaConfiguracion);

    // Calcular monedas ganadas esta semana antes de registrar esta partida
    const weeklyEarnedBefore = await getWeeklyCoinsEarned(userId, prisma, config, dailyBonus);
    const WEEKLY_CAP = 300;

    let pointsAwarded = 0;
    let message = '';
    let breakdown = { participation: 0, performance: 0, recordBonus: 0, daily: 0 };

    if (weeklyEarnedBefore >= WEEKLY_CAP) {
      pointsAwarded = 0;
      message = '¡Partida registrada! Has alcanzado el límite semanal de 300 monedas para juegos.';
    } else {
      const calcResult = calculateCoins(
        gameKey,
        puntajeNuevo,
        oldBest,
        isFirstGameToday,
        config,
        dailyBonus
      );
      breakdown = calcResult.breakdown;
      const potentialPoints = calcResult.total;

      if (weeklyEarnedBefore + potentialPoints > WEEKLY_CAP) {
        pointsAwarded = WEEKLY_CAP - weeklyEarnedBefore;
        message = `¡Partida registrada! Ganaste ${pointsAwarded} monedas (llegaste al límite semanal de 300 monedas).`;
      } else {
        pointsAwarded = potentialPoints;
        message = buildRewardMessage(breakdown, pointsAwarded);
      }
    }

    await prisma.puntuacionJuego.create({
      data: {
        game_name: gameKey,
        score: puntajeNuevo,
        user_id: userId,
      },
    });

    let updatedUser;
    if (pointsAwarded > 0) {
      updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { points: { increment: pointsAwarded } },
      });
      
      if (updatedUser.username === 'choe') {
        const oldPoints = updatedUser.points - pointsAwarded;
        checkCoinsMilestone(oldPoints, updatedUser.points, 'choe');
      }
    } else {
      updatedUser = await prisma.user.findUnique({ where: { id: userId } });
    }

    res.json({
      success: true,
      pointsAwarded,
      breakdown,
      totalPoints: updatedUser.points,
      isNewRecord: pointsAwarded > 0 ? (score > oldBest) : false,
      isFirstGameToday,
      previousBest: oldBest,
      message,
    });
  } catch (err) {
    console.error('Error al registrar puntuación:', err);
    res.status(500).json({ error: 'Error interno al registrar la puntuación.' });
  }
});

// GET /api/games/leaderboard/:game_name
router.get('/leaderboard/:game_name', verificarUsuario, async (req, res) => {
  const { game_name } = req.params;

  try {
    const leaderboard = await prisma.puntuacionJuego.findMany({
      where: { game_name: game_name.toLowerCase() },
      orderBy: { score: 'desc' },
      take: 5,
      include: {
        user: { select: { username: true } },
      },
    });

    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener la tabla de posiciones.' });
  }
});

export default router;

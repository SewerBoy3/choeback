import { notifyFer } from '../services/notificationService.js';

/**
 * Verifica si Zoe ha cruzado un múltiplo de 100 monedas y notifica a Fer.
 */
export async function checkCoinsMilestone(oldPoints, newPoints, username) {
  if (username !== 'choe') return;
  
  const oldMilestone = Math.floor(oldPoints / 100);
  const newMilestone = Math.floor(newPoints / 100);
  
  if (newMilestone > oldMilestone && newMilestone > 0) {
    try {
      await notifyFer(
        `🪙 ¡Hito de Monedas Alcanzado!`,
        `Zoe ha alcanzado las **${newMilestone * 100}** monedas (Tiene un total de **${newPoints}** Monedas de Amor). 🎉`,
        0xFBBF24
      );
      console.log(`🚀 Notificación de hito de 100 monedas enviada a Fer. Total: ${newPoints}`);
    } catch (err) {
      console.error('Error al enviar hito de monedas:', err.message);
    }
  }
}

import { redis } from '../lib/redis.js';
import { verifyToken } from '../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!verifyToken(req)) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }

  try {
    const body = req.body;
    const ops = [];

    // Estado actual
    if (body.current) {
      const current = { ...body.current, updated_at: Date.now() };
      ops.push(redis.set('snip:latest', JSON.stringify(current), { ex: 300 }));
    }

    // Parámetros del bot
    if (body.params) {
      ops.push(redis.set('snip:params', JSON.stringify(body.params), { ex: 86400 }));
    }

    // Señales del día
    if (body.signals) {
      ops.push(redis.set('snip:signals', JSON.stringify(body.signals), { ex: 86400 }));
    }

    // Datos de calibración
    if (body.calib) {
      ops.push(redis.set('snip:calib', JSON.stringify(body.calib), { ex: 86400 * 4 }));
    }

    // Trade cerrado
    if (body.trade) {
      const tradeStr = JSON.stringify(body.trade);
      ops.push(redis.lpush('snip:trades', tradeStr));
      ops.push(redis.ltrim('snip:trades', 0, 49));

      // Actualizar métricas
      const metricsRaw = await redis.get('snip:metrics');
      const m = metricsRaw
        ? (typeof metricsRaw === 'string' ? JSON.parse(metricsRaw) : metricsRaw)
        : { total_trades: 0, wins: 0, win_rate: 0, total_pnl: 0, best_trade: null, worst_trade: null };

      m.total_trades = (m.total_trades || 0) + 1;
      if (body.trade.roi > 0) m.wins = (m.wins || 0) + 1;
      m.win_rate   = m.total_trades > 0 ? (m.wins / m.total_trades) * 100 : 0;
      m.total_pnl  = (m.total_pnl || 0) + (body.trade.pnl_usdt || 0);
      m.best_trade  = m.best_trade  === null ? body.trade.roi : Math.max(m.best_trade,  body.trade.roi);
      m.worst_trade = m.worst_trade === null ? body.trade.roi : Math.min(m.worst_trade, body.trade.roi);

      ops.push(redis.set('snip:metrics', JSON.stringify(m), { ex: 86400 * 30 }));
    }

    // Evento / notificación (toast)
    if (body.event) {
      const notif = { ...body.event, id: Date.now(), timestamp: Date.now() };
      ops.push(redis.set('snip:notification', JSON.stringify(notif), { ex: 35 }));
    }

    await Promise.all(ops);
    return res.status(200).json({ status: 'ok' });

  } catch (err) {
    console.error('Update error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

import { redis } from '../lib/redis.js';
import { verifyViewer } from '../lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const vid = req.query.vid;

    // Track viewer si tiene ID
    if (vid) {
      await redis.set(`snip:viewer:${vid}`, Date.now(), { ex: 45 });
    }

    // Leer todo en paralelo
    const [latestRaw, tradesRaw, metricsRaw, paramsRaw, notifRaw, calibRaw, signalsRaw] =
      await Promise.all([
        redis.get('snip:latest'),
        redis.lrange('snip:trades', 0, 9),
        redis.get('snip:metrics'),
        redis.get('snip:params'),
        redis.get('snip:notification'),
        redis.get('snip:calib'),
        redis.get('snip:signals'),
      ]);

    const current  = latestRaw  ? (typeof latestRaw  === 'string' ? JSON.parse(latestRaw)  : latestRaw)  : null;
    const metrics  = metricsRaw ? (typeof metricsRaw === 'string' ? JSON.parse(metricsRaw) : metricsRaw) : null;
    const params   = paramsRaw  ? (typeof paramsRaw  === 'string' ? JSON.parse(paramsRaw)  : paramsRaw)  : null;
    const notif    = notifRaw   ? (typeof notifRaw   === 'string' ? JSON.parse(notifRaw)   : notifRaw)   : null;
    const calib    = calibRaw   ? (typeof calibRaw   === 'string' ? JSON.parse(calibRaw)   : calibRaw)   : null;
    const signals  = signalsRaw ? (typeof signalsRaw === 'string' ? JSON.parse(signalsRaw) : signalsRaw) : null;

    const recent_trades = (tradesRaw || []).map(t =>
      typeof t === 'string' ? JSON.parse(t) : t
    );

    // Calcular duración si hay posición abierta
    if (current?.entry_time && current?.position) {
      const entryMs = new Date(current.entry_time).getTime();
      const diffMin = Math.floor((Date.now() - entryMs) / 60000);
      const h = Math.floor(diffMin / 60);
      const m = diffMin % 60;
      current.duration = h > 0 ? `${h}h ${m}m` : `${m}m`;
    }

    // Contar viewers activos
    let viewer_count = 1;
    try {
      const keys = await redis.keys('snip:viewer:*');
      viewer_count = Math.max(1, keys.length);
    } catch (_) {}

    // Warning si el bot lleva más de 2 minutos sin update
    let warning = null;
    if (current?.updated_at) {
      const secsSince = (Date.now() - current.updated_at) / 1000;
      if (secsSince > 120) {
        warning = `⚠️ Sin datos del bot hace ${Math.floor(secsSince / 60)} minutos`;
      }
    }

    return res.status(200).json({
      current,
      metrics,
      params,
      recent_trades,
      calib,
      signals,
      notification: notif,
      viewer_count,
      warning,
    });

  } catch (err) {
    console.error('Data error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
}

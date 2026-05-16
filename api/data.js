import { getRedis } from "../lib/redis.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=20");

  const redis = getRedis();

  try {
    const viewerId = req.query.vid;
    if (viewerId) {
      await redis.set(`snip:viewer:${viewerId}`, "1", { ex: 45 });
    }

    const viewerKeys = await redis.keys("snip:viewer:*");
    const activeViewers = viewerKeys ? viewerKeys.length : 0;

    // Obtener todos los datos en paralelo
    const [latestRaw, tradesRaw, metricsRaw, paramsRaw, signalsRaw] = await Promise.all([
      redis.get("snip:latest"),
      redis.lrange("snip:trades", 0, 9),
      redis.get("snip:metrics"),
      redis.get("snip:params"),
      redis.get("snip:signals"),
    ]);

    // Parsear cada dato con manejo de errores
    let current = null;
    try {
      current = latestRaw ? JSON.parse(latestRaw) : null;
    } catch (e) {
      console.error("Error parsing latest:", e);
    }

    let metrics = null;
    try {
      metrics = metricsRaw ? JSON.parse(metricsRaw) : null;
    } catch (e) {
      console.error("Error parsing metrics:", e);
    }

    let params = null;
    try {
      params = paramsRaw ? JSON.parse(paramsRaw) : null;
    } catch (e) {
      console.error("Error parsing params:", e);
    }

    let signals = null;
    try {
      signals = signalsRaw ? JSON.parse(signalsRaw) : null;
    } catch (e) {
      console.error("Error parsing signals:", e);
    }

    // Procesar trades
    const recent_trades = [];
    if (tradesRaw && tradesRaw.length > 0) {
      for (const t of tradesRaw) {
        try {
          const trade = typeof t === "string" ? JSON.parse(t) : t;
          if (trade.ts) {
            const d = new Date(trade.ts);
            trade.time = d.toLocaleTimeString("es-AR", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "America/Argentina/Buenos_Aires",
            });
          }
          recent_trades.push(trade);
        } catch (e) {
          console.error("Error parsing trade:", e);
        }
      }
    }

    // Calcular duración si hay posición
    let duration = null;
    if (current && current.entry_time) {
      let entryTime = current.entry_time;
      if (typeof entryTime === "string") {
        entryTime = new Date(entryTime).getTime();
      }
      if (typeof entryTime === "number" && !isNaN(entryTime)) {
        const mins = Math.floor((Date.now() - entryTime) / 60000);
        if (mins < 60) duration = `${mins}m`;
        else duration = `${Math.floor(mins / 60)}h ${mins % 60}m`;
      }
    }

    // Respuesta final
    const response = {
      generated_at: Date.now(),
      active_viewers: activeViewers,
      warning: activeViewers >= 3 ? `⚠️ ${activeViewers} viewers activos` : null,
      current: current || { price: null, position: null, status: "OFFLINE", updated_at: null },
      metrics: metrics || { total_trades: 0, win_rate: 0, total_pnl: 0, best_trade: null, worst_trade: null, wins: 0 },
      recent_trades,
      params: params || null,
      signals: signals || null,
    };

    // Añadir duración si existe
    if (duration && response.current) {
      response.current.duration = duration;
    }

    return res.status(200).json(response);
  } catch (err) {
    console.error("Data error:", err);
    return res.status(500).json({ 
      status: "error", 
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined
    });
  }
}

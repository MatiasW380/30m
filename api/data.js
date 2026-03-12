import { getRedis } from "../lib/redis.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ status: "error", message: "Method not allowed" });
  }

  res.setHeader("Access-Control-Allow-Origin", "*");

  const redis = getRedis();

  try {
    const viewerId = req.query.vid;
    if (viewerId) {
      await redis.set(`snip:viewer:${viewerId}`, "1", { ex: 45 });
    }

    const viewerKeys = await redis.keys("snip:viewer:*");
    const activeViewers = viewerKeys ? viewerKeys.length : 0;

    // Leer datos en paralelo — agregamos calib y signals
    const [latestRaw, tradesRaw, metricsRaw, paramsRaw, notifRaw, calibRaw, signalsRaw] =
      await Promise.all([
        redis.get("snip:latest"),
        redis.lrange("snip:trades", 0, 9),
        redis.get("snip:metrics"),
        redis.get("snip:params"),
        redis.get("snip:notification"),
        redis.get("snip:calib"),
        redis.get("snip:signals"),
      ]);

    const current = latestRaw
      ? typeof latestRaw === "string" ? JSON.parse(latestRaw) : latestRaw
      : null;

    const metrics = metricsRaw
      ? typeof metricsRaw === "string" ? JSON.parse(metricsRaw) : metricsRaw
      : null;

    const params = paramsRaw
      ? typeof paramsRaw === "string" ? JSON.parse(paramsRaw) : paramsRaw
      : null;

    const notification = notifRaw
      ? typeof notifRaw === "string" ? JSON.parse(notifRaw) : notifRaw
      : null;

    const calib = calibRaw
      ? typeof calibRaw === "string" ? JSON.parse(calibRaw) : calibRaw
      : null;

    const signals = signalsRaw
      ? typeof signalsRaw === "string" ? JSON.parse(signalsRaw) : signalsRaw
      : null;

    const recent_trades = (tradesRaw || []).map((t) => {
      const trade = typeof t === "string" ? JSON.parse(t) : t;
      if (trade.ts) {
        const d = new Date(trade.ts);
        trade.time = d.toLocaleTimeString("es-AR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "America/Argentina/Buenos_Aires",
        });
      }
      return trade;
    });

    let duration = null;
    if (current && current.entry_time) {
      const mins = Math.floor((Date.now() - new Date(current.entry_time).getTime()) / 60000);
      if (mins < 60) duration = `${mins}m`;
      else duration = `${Math.floor(mins / 60)}h ${mins % 60}m`;
    }

    const response = {
      generated_at: Date.now(),
      active_viewers: activeViewers,
      warning: activeViewers >= 3 ? `⚠️ ${activeViewers} viewers activos — consumo alto` : null,
      current: current
        ? { ...current, duration }
        : { price: null, position: null, status: "OFFLINE" },
      metrics: metrics || {
        total_trades: 0,
        win_rate: 0,
        total_pnl: 0,
        best_trade: null,
        worst_trade: null,
        wins: 0,
      },
      recent_trades,
      params: params || null,
      notification,
      calib: calib || null,
      signals: signals || null,
    };

    res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=20");
    return res.status(200).json(response);
  } catch (err) {
    console.error("Data error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
}

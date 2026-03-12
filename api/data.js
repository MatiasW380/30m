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

    const [latestRaw, tradesRaw, metricsRaw, paramsRaw, notifRaw] = await Promise.all([
      redis.get("snip:latest"),
      redis.lrange("snip:trades", 0, 9),
      redis.get("snip:metrics"),
      redis.get("snip:params"),
      redis.get("snip:notification"),
    ]);

    const parse = (raw) => raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null;

    const current = parse(latestRaw);
    const metrics = parse(metricsRaw);
    const params  = parse(paramsRaw);
    const notification = parse(notifRaw);

    const recent_trades = (tradesRaw || []).map((t) => {
      const trade = typeof t === "string" ? JSON.parse(t) : t;
      if (trade.ts) {
        const d = new Date(trade.ts);
        trade.time = d.toLocaleTimeString("es-AR", {
          hour: "2-digit", minute: "2-digit",
          timeZone: "America/Argentina/Buenos_Aires",
        });
      }
      return trade;
    });

    let duration = null;
    if (current?.entry_time) {
      const mins = Math.floor((Date.now() - new Date(current.entry_time).getTime()) / 60000);
      duration = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
    }

    return res.status(200).json({
      generated_at: Date.now(),
      active_viewers: activeViewers,
      warning: activeViewers >= 3 ? `⚠️ ${activeViewers} viewers activos — consumo alto` : null,
      current: current ? { ...current, duration } : { price: null, position: null, status: "OFFLINE" },
      metrics: metrics || { total_trades: 0, win_rate: 0, total_pnl: 0, best_trade: null, worst_trade: null, wins: 0 },
      recent_trades,
      params: params || null,
      notification,
    });
  } catch (err) {
    console.error("Data error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
}

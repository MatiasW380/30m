import { getRedis } from "../lib/redis.js";
import { authenticateBot } from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "error", message: "Method not allowed" });
  }

  if (!authenticateBot(req)) {
    return res.status(401).json({ status: "error", message: "Unauthorized" });
  }

  const redis = getRedis();
  const body = req.body;
  const saved = [];

  try {
    if (body.current) {
      const current = { ...body.current, updated_at: Date.now() };
      await redis.set("snip:latest", JSON.stringify(current));
      saved.push("current");
    }

    if (body.trade) {
      const trade = body.trade;
      await redis.lpush("snip:trades", JSON.stringify(trade));
      await redis.ltrim("snip:trades", 0, 49);

      const metricsRaw = await redis.get("snip:metrics");
      let metrics = metricsRaw
        ? typeof metricsRaw === "string" ? JSON.parse(metricsRaw) : metricsRaw
        : { total_trades: 0, wins: 0, total_pnl: 0, best_trade: null, worst_trade: null };

      metrics.total_trades += 1;
      if (trade.roi > 0) metrics.wins += 1;
      metrics.total_pnl = (metrics.total_pnl || 0) + (trade.pnl_usdt || 0);
      metrics.best_trade = metrics.best_trade === null ? trade.roi : Math.max(metrics.best_trade, trade.roi);
      metrics.worst_trade = metrics.worst_trade === null ? trade.roi : Math.min(metrics.worst_trade, trade.roi);
      metrics.win_rate = metrics.total_trades > 0 ? (metrics.wins / metrics.total_trades) * 100 : 0;

      await redis.set("snip:metrics", JSON.stringify(metrics));
      saved.push("trade", "metrics");
    }

    if (body.event) {
      const event = { ...body.event, id: Date.now(), timestamp: Date.now() };
      await redis.set("snip:notification", JSON.stringify(event), { ex: 35 });
      saved.push("event");
    }

    if (body.params) {
      await redis.set("snip:params", JSON.stringify(body.params));
      saved.push("params");
    }

    return res.status(200).json({ status: "ok", saved });
  } catch (err) {
    console.error("Update error:", err);
    return res.status(500).json({ status: "error", message: err.message });
  }
}

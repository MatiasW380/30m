import { getRedis } from "../lib/redis.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const redis = getRedis();

  try {
    const latestRaw = await redis.get("snip:latest");
    const latest = latestRaw
      ? typeof latestRaw === "string" ? JSON.parse(latestRaw) : latestRaw
      : null;

    const botLastSeen = latest?.updated_at || null;
    const secondsSinceUpdate = botLastSeen
      ? Math.floor((Date.now() - botLastSeen) / 1000)
      : null;

    const botStatus =
      secondsSinceUpdate === null ? "NEVER_SEEN" :
      secondsSinceUpdate < 120   ? "ONLINE" :
      secondsSinceUpdate < 300   ? "DELAYED" : "OFFLINE";

    return res.status(200).json({
      status: "ok",
      timestamp: Date.now(),
      bot_status: botStatus,
      bot_last_seen: botLastSeen,
      seconds_since_update: secondsSinceUpdate,
      redis: "connected",
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      redis: "disconnected",
      message: err.message,
    });
  }
}

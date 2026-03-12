// Crear archivo: /api/test-redis.js
import { getRedis } from "../lib/redis.js";

export default async function handler(req, res) {
  try {
    const redis = getRedis();
    
    // Test 1: Ping
    const ping = await redis.ping();
    
    // Test 2: Set y Get
    const testKey = `test:${Date.now()}`;
    await redis.set(testKey, "vercel-test");
    const value = await redis.get(testKey);
    
    res.status(200).json({
      ping,
      test_key: testKey,
      test_value: value,
      redis_url: process.env.UPSTASH_REDIS_REST_URL ? "present" : "missing",
      redis_token: process.env.UPSTASH_REDIS_REST_TOKEN ? "present" : "missing"
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      stack: err.stack
    });
  }
}

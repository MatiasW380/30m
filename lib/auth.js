export function authenticateBot(req) {
  const token = req.headers["x-bot-token"];
  return token === process.env.BOT_TOKEN;
}

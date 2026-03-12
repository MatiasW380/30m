const POLL_INTERVAL = 30000;
const API_BASE = "";
const VIEWER_ID = Math.random().toString(36).slice(2, 10);

let lastNotificationId = null;
let lastPrice = null;
let pollTimer = null;

const $ = (id) => document.getElementById(id);

function fmt(n, decimals = 2) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPrice(n) {
  if (!n) return "—";
  return "$" + Number(n).toLocaleString("es-AR", { maximumFractionDigits: 1 });
}

function fmtRoi(n) {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

function secAgo(ts) {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

async function fetchData() {
  try {
    const res = await fetch(`${API_BASE}/api/data?vid=${VIEWER_ID}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error("Fetch error:", e);
    return null;
  }
}

function renderHeader(data) {
  const price = data?.current?.price;
  const status = data?.current?.status || "OFFLINE";

  if (price) {
    const el = $("h-price");
    el.textContent = fmtPrice(price);
    if (lastPrice !== null) {
      el.classList.remove("up", "down");
      if (price > lastPrice) el.classList.add("up");
      else if (price < lastPrice) el.classList.add("down");
      setTimeout(() => el.classList.remove("up", "down"), 1000);
    }
    lastPrice = price;
  }

  const pill = $("status-pill");
  const pillText = $("status-text");
  pill.className = "status-pill";
  if (status === "RUNNING") { pill.classList.add("online"); pillText.textContent = "RUNNING"; }
  else if (status === "HALTED") { pill.classList.add("halted"); pillText.textContent = "HALTED"; }
  else { pill.classList.add("offline"); pillText.textContent = "OFFLINE"; }

  $("last-update").textContent = secAgo(data?.current?.updated_at);
}

function renderPosition(current) {
  const card = document.querySelector(".card-position");
  const pos = current?.position;

  $("pos-side").textContent = pos || "FLAT";
  card.classList.remove("long", "short");
  if (pos === "LONG") card.classList.add("long");
  else if (pos === "SHORT") card.classList.add("short");

  const roiEl = $("pos-roi");
  if (pos && current?.roi !== null && current?.roi !== undefined) {
    roiEl.textContent = fmtRoi(current.roi) + " (x10)";
    roiEl.className = "pos-val roi-val " + (current.roi >= 0 ? "positive" : "negative");
  } else {
    roiEl.textContent = "—";
    roiEl.className = "pos-val roi-val";
  }

  $("pos-entry").textContent    = pos ? fmtPrice(current?.entry)    : "—";
  $("pos-stop").textContent     = pos ? fmtPrice(current?.stop)     : "—";
  $("pos-trailing").textContent = pos ? fmtPrice(current?.trailing) : "—";
  $("pos-duration").textContent = current?.duration || "—";
}

function renderMetrics(metrics, params) {
  if (!metrics) return;

  $("m-trades").textContent = metrics.total_trades ?? "—";

  const wr = metrics.win_rate;
  const wrEl = $("m-winrate");
  wrEl.textContent = wr !== null && wr !== undefined ? fmt(wr, 1) + "%" : "—";
  wrEl.className = "metric-value " + (wr >= 50 ? "positive" : wr > 0 ? "" : "negative");

  const pnl = metrics.total_pnl;
  const pnlEl = $("m-pnl");
  pnlEl.textContent = pnl !== null && pnl !== undefined
    ? (pnl >= 0 ? "+" : "") + "$" + fmt(Math.abs(pnl), 0) : "—";
  pnlEl.className = "metric-value " + (pnl >= 0 ? "positive" : "negative");

  const best = metrics.best_trade;
  $("m-best").textContent = best !== null && best !== undefined ? "+" + fmt(best, 2) + "%" : "—";

  const worst = metrics.worst_trade;
  const worstEl = $("m-worst");
  worstEl.textContent = worst !== null && worst !== undefined ? fmt(worst, 2) + "%" : "—";
  worstEl.className = "metric-value " + (worst !== null && worst < 0 ? "negative" : "");

  $("m-timeframe").textContent = params?.timeframe || "30m";
}

function renderParams(params) {
  if (!params) return;
  $("p-short").textContent = params.short     ?? "—";
  $("p-long").textContent  = params.long      ?? "—";
  $("p-adx").textContent   = params.adx       ?? "—";
  $("p-atr").textContent   = params.atr_mult  ?? "—";
  $("p-calib").textContent = params.last_calib ?? "—";
}

function renderTrades(trades) {
  const tbody = $("trades-tbody");
  if (!trades || trades.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Sin operaciones registradas</td></tr>`;
    return;
  }
  tbody.innerHTML = trades.map((t) => {
    const sideCls = (t.side || "").toLowerCase();
    const roiCls  = t.roi >= 0 ? "roi-positive" : "roi-negative";
    const reason  = t.reason || t.exit_reason || "—";
    return `
      <tr>
        <td>${t.time || "—"}</td>
        <td><span class="side-badge ${sideCls}">${t.side || "—"}</span></td>
        <td>${fmtPrice(t.entry)}</td>
        <td>${fmtPrice(t.exit)}</td>
        <td class="${roiCls}">${fmtRoi(t.roi)}</td>
        <td><span class="reason-badge">${reason}</span></td>
      </tr>`;
  }).join("");
}

function renderWarning(warning) {
  const banner = $("warning-banner");
  if (warning) { banner.textContent = warning; banner.classList.remove("hidden"); }
  else { banner.classList.add("hidden"); }
}

function showToast(notif) {
  if (!notif) return;
  const id = notif.id || notif.timestamp;
  if (id === lastNotificationId) return;
  lastNotificationId = id;

  const container = $("toast-container");
  const div = document.createElement("div");
  div.className = `toast ${notif.type || "signal"}`;

  const titles = {
    signal:         "🎯 SEÑAL DETECTADA",
    position_open:  "🚀 POSICIÓN ABIERTA",
    position_close: "🛑 POSICIÓN CERRADA",
  };

  const price = notif.price ? fmtPrice(notif.price) : "";
  const side  = notif.side  ? `<strong>${notif.side}</strong> ` : "";
  const roi   = notif.roi !== undefined && notif.roi !== null ? ` · ROI ${fmtRoi(notif.roi)}` : "";

  div.innerHTML = `
    <div class="toast-title">${titles[notif.type] || "EVENTO"}</div>
    <div class="toast-body">${side}${price}${roi}</div>
    <div class="toast-time">ahora mismo</div>
  `;

  container.prepend(div);
  setTimeout(() => {
    div.style.opacity = "0";
    div.style.transform = "translateX(20px)";
    div.style.transition = "all 0.3s ease";
    setTimeout(() => div.remove(), 300);
  }, 6000);

  const toasts = container.querySelectorAll(".toast");
  if (toasts.length > 3) toasts[toasts.length - 1].remove();
}

function render(data) {
  if (!data) {
    $("status-pill").className = "status-pill offline";
    $("status-text").textContent = "ERROR";
    return;
  }
  renderHeader(data);
  renderPosition(data.current);
  renderMetrics(data.metrics, data.params);
  renderParams(data.params);
  renderTrades(data.recent_trades);
  renderWarning(data.warning);
  showToast(data.notification);
}

async function poll() {
  const data = await fetchData();
  render(data);
}

async function startPolling() {
  await poll();
  pollTimer = setInterval(poll, POLL_INTERVAL);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) { clearInterval(pollTimer); }
  else { poll(); pollTimer = setInterval(poll, POLL_INTERVAL); }
});

startPolling();

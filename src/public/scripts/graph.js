function generateDates(count) {
  const pad = (n) => n.toString().padStart(2, "0");
  const today = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    return `${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
  }).reverse();
}

function getCanvasData(index) {
  const canvas = document.getElementById(`graph-${index}`);
  let prices = JSON.parse(canvas.dataset.prices || "[]").map(Math.ceil);
  if (prices.length === 0) prices = [0, 0];
  const dates = generateDates(prices.length);

  prices.push(prices.at(-1));
  dates.push("nå");

  const section = document.getElementById(index);
  const color = getComputedStyle(section).getPropertyValue("--color").trim();
  const colors = { marker: `rgba(${color}, 0.6)`, line: `rgba(${color}, 0.2)` };

  return { canvas, prices, dates, colors };
}

function setupCanvas(canvas) {
  const parent = canvas.parentElement;
  const dpr = window.devicePixelRatio || 1;

  // Get the parent's dimensions
  const rect = parent.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  // Set the canvas resolution
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);

  // Scale the context
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  return ctx;
}

function getScales(prices, canvas, margin) {
  const width = canvas.width - margin.left - margin.right;
  const height = canvas.height - margin.top - margin.bottom;
  const xScale = width / Math.max(prices.length - 1, 1);
  const yMax = Math.max(...prices);
  const yMin = Math.min(...prices);
  const yScale = height / (yMax - yMin || 1);
  return { xScale, yScale, yMin };
}

function xPos(i, scales, margin) {
  return i * scales.xScale + margin.left;
}
function yPos(value, canvas, scales, margin) {
  return canvas.height - (value - scales.yMin) * scales.yScale - margin.bottom;
}

function drawLine(ctx, canvas, prices, scales, colors, margin) {
  ctx.beginPath();
  ctx.moveTo(margin.left, yPos(prices[0], canvas, scales, margin));
  for (let i = 1; i < prices.length; i++) {
    ctx.lineTo(
      xPos(i, scales, margin),
      yPos(prices[i - 1], canvas, scales, margin),
    ); // Horizontally to new X.
    ctx.lineTo(
      xPos(i, scales, margin),
      yPos(prices[i], canvas, scales, margin),
    ); // Vertically to new Y.
  }
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 10;
  ctx.stroke();
}

function drawMarkers(ctx, canvas, prices, scales, colors, margin) {
  for (let i = 0; i < prices.length; i++) {
    ctx.beginPath();
    ctx.rect(
      xPos(i, scales, margin) - 5,
      yPos(prices[i], canvas, scales, margin) - 5,
      10,
      10,
    );
    ctx.fillStyle = colors.marker;
    ctx.fill();
  }
}

function drawAxes(ctx, canvas, dates, prices, scales, margin) {
  ctx.fillStyle = "black";
  ctx.font = "12px monospace";

  let maxLabels;

  // X labels
  ctx.textAlign = "center";
  const plotWidth = canvas.width;
  const sampleWidth = ctx.measureText(dates[0]).width + 2;
  maxLabels = Math.floor(plotWidth / sampleWidth) - 1;
  const mod = Math.ceil(dates.length / maxLabels);
  dates.forEach((d, i) => {
    if ((i + 1) % mod === 0) {
      ctx.fillText(
        d,
        xPos(i, scales, margin),
        canvas.height - margin.bottom + 20,
      );
    }
  });

  // Y labels
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  maxLabels = Math.min(new Set(prices).size, 5);
  for (let i = 0; i <= (maxLabels > 1 ? maxLabels : 0); i++) {
    const v =
      scales.yMin + ((Math.max(...prices) - scales.yMin) * i) / maxLabels;
    ctx.fillText(
      v.toFixed(0),
      margin.left - 10,
      yPos(v, canvas, scales, margin),
    );
  }
}

function setupHover(canvas, prices, dates, scales, colors, margin) {
  const old = canvas.parentElement.querySelector(".hover-layer");
  if (old) old.remove();

  const hover = document.createElement("canvas");
  hover.className = "hover-layer";

  const dpr = window.devicePixelRatio || 1;

  // Match the main canvas dimensions exactly
  hover.width = canvas.width;
  hover.height = canvas.height;

  // Position absolutely and match CSS size (100%)
  hover.style.position = "absolute";
  hover.style.left = "0";
  hover.style.top = "0";
  hover.style.width = "100%";
  hover.style.height = "100%";
  hover.style.pointerEvents = "none";

  canvas.parentElement.appendChild(hover);

  const hctx = hover.getContext("2d");
  hctx.scale(dpr, dpr);

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const idx = Math.floor((x - margin.left) / scales.xScale);

    hctx.clearRect(0, 0, hover.width, hover.height);

    if (idx < 0 || idx >= prices.length) return;

    hctx.fillStyle = "black";
    hctx.font = "12px monospace";
    hctx.fillText(`${prices[idx]} kr (${dates[idx]})`, x + 10, y);

    hctx.beginPath();
    hctx.moveTo(x, 0);
    hctx.lineTo(x, rect.height);
    hctx.strokeStyle = colors.line;
    hctx.lineWidth = 10;
    hctx.stroke();
  });

  canvas.addEventListener("mouseleave", () => {
    hctx.clearRect(0, 0, hover.width, hover.height);
  });
}

function graphPrice(index) {
  const { canvas, prices, dates, colors } = getCanvasData(index);
  const ctx = setupCanvas(canvas);

  const margin = {
    top: 20,
    right: 10,
    bottom: 20,
    left: Math.max(...prices) > 10000 ? 60 : 40,
  };

  const scales = getScales(prices, canvas, margin);

  drawLine(ctx, canvas, prices, scales, colors, margin);
  drawMarkers(ctx, canvas, prices, scales, colors, margin);
  drawAxes(ctx, canvas, dates, prices, scales, margin);
  setupHover(canvas, prices, dates, scales, colors, margin);
}

function drawGraphs() {
  document.querySelectorAll("[id^=graph-]").forEach((canvas) => {
    const index = canvas.id.replace("graph-", "");
    graphPrice(index);
  });
}

document.addEventListener("DOMContentLoaded", drawGraphs);
window.addEventListener("resize", function () {
  drawGraphs();
});

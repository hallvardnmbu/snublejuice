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
  const line = getComputedStyle(section).getPropertyValue("--line").trim();
  const marker = getComputedStyle(section).getPropertyValue("--marker").trim();
  const colors = {
    line: `rgba(${color}, ${line})`,
    marker: `rgba(${color}, ${marker})`,
  };

  const textColor = getComputedStyle(section).getPropertyValue("color").trim();
  const font = getComputedStyle(section).getPropertyValue("font-family").trim();
  const fontSize = getComputedStyle(section)
    .getPropertyValue("font-size")
    .trim();
  const text = {
    color: textColor,
    font: font,
    size: fontSize,
  };

  return { canvas, prices, dates, colors, text };
}

function setupCanvas(dpr, canvas, maxPrice, text) {
  const parent = canvas.parentElement;

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

  const size = {
    line: dpr > 1 ? 6 : 10,
    width: width,
    height: height,
    top: 5,
    right: 10,
    bottom: 20,
    left: new String(maxPrice).length * parseInt(text.size.replace("px", "")),
  };

  return { ctx, size };
}

function getScales(prices, size) {
  const width = size.width - size.left - size.right;
  const height = size.height - size.top - size.bottom;
  const xScale = width / Math.max(prices.length - 1, 1);
  const yMax = Math.max(...prices);
  const yMin = Math.min(...prices);
  const yScale = height / (yMax - yMin || 1);
  return { xScale, yScale, yMin };
}

function xPos(i, scales, size) {
  return i * scales.xScale + size.left;
}
function yPos(value, scales, size) {
  return size.height - (value - scales.yMin) * scales.yScale - size.bottom;
}

function drawLine(ctx, prices, scales, colors, size) {
  ctx.beginPath();
  ctx.moveTo(size.left - size.line / 2, yPos(prices[0], scales, size));
  for (let i = 1; i < prices.length; i++) {
    ctx.lineTo(xPos(i, scales, size), yPos(prices[i - 1], scales, size)); // Horizontally to new X.
    ctx.lineTo(
      xPos(i, scales, size) + (i === prices.length - 1 ? size.line / 2 : 0),
      yPos(prices[i], scales, size),
    ); // Vertically to new Y.
  }
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = size.line;
  ctx.stroke();
}

function drawMarkers(ctx, prices, scales, colors, size) {
  for (let i = 0; i < prices.length; i++) {
    ctx.beginPath();
    ctx.rect(
      xPos(i, scales, size) - size.line / 2,
      yPos(prices[i], scales, size) - size.line / 2,
      size.line,
      size.line,
    );
    ctx.fillStyle = colors.marker;
    ctx.fill();
  }
}

function drawAxes(ctx, dates, prices, scales, text, size) {
  ctx.fillStyle = text.color;
  ctx.font = text.size + " " + text.font;

  let maxLabels;

  // X labels
  ctx.textAlign = "center";
  const plotWidth = size.width;
  const sampleWidth = ctx.measureText(dates[0]).width + 2;
  maxLabels = Math.floor(plotWidth / sampleWidth) - 1;
  const mod = Math.ceil(dates.length / maxLabels);
  dates.forEach((d, i) => {
    if ((i + 1) % mod === 0) {
      ctx.fillText(d, xPos(i, scales, size), size.height - size.bottom + 20);
    }
  });

  // Y labels
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  maxLabels = Math.min(new Set(prices).size, 5);
  for (let i = 0; i <= (maxLabels > 1 ? maxLabels : 0); i++) {
    const v =
      scales.yMin + ((Math.max(...prices) - scales.yMin) * i) / maxLabels;
    ctx.fillText(v.toFixed(0), size.left - size.line, yPos(v, scales, size));
  }
}

function setupHover(dpr, canvas, prices, dates, scales, colors, text, size) {
  const old = canvas.parentElement.querySelector(".hover-layer");
  if (old) old.remove();

  const hover = document.createElement("canvas");
  hover.className = "hover-layer";

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
    const idx = Math.floor((x - size.left) / scales.xScale);

    hctx.clearRect(0, 0, hover.width, hover.height);

    if (idx < 0 || idx >= prices.length) return;

    hctx.fillStyle = text.color;
    hctx.font = text.size + " " + text.font;
    hctx.fillText(`${prices[idx]} kr (${dates[idx]})`, x + size.line, y);

    hctx.beginPath();
    hctx.moveTo(x, 0);
    hctx.lineTo(x, rect.height);
    hctx.strokeStyle = colors.line;
    hctx.lineWidth = size.line;
    hctx.stroke();
  });

  canvas.addEventListener("mouseleave", () => {
    hctx.clearRect(0, 0, hover.width, hover.height);
  });
}

function graphPrice(index) {
  const dpr = window.devicePixelRatio || 1;

  const { canvas, prices, dates, colors, text } = getCanvasData(index);
  const { ctx, size } = setupCanvas(dpr, canvas, Math.max(...prices), text);

  const scales = getScales(prices, size);

  drawLine(ctx, prices, scales, colors, size);
  drawMarkers(ctx, prices, scales, colors, size);
  drawAxes(ctx, dates, prices, scales, text, size);
  setupHover(dpr, canvas, prices, dates, scales, colors, text, size);
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

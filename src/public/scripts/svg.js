function getPathData(index) {
  const path = document.getElementById(`path-${index}`);

  let prices = JSON.parse(path.dataset.prices || "[]").map(Math.ceil);
  if (prices.length === 0) prices = [0, 0];
  prices.push(prices.at(-1));

  return { path, prices };
}

function setupPath(path, index) {
  const svg = path.ownerSVGElement;
  const rect = svg.parentElement.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);

  const section = document.getElementById(index);
  const margin = parseInt(
    getComputedStyle(section)
      .getPropertyValue("--margin")
      .replace("px", "")
      .trim(),
  );

  const size = {
    width: rect.width,
    height: rect.height,
    top: rect.height / 4 + margin,
    right: 0,
    bottom: 5 * margin,
    left: 0,
  };

  return { size };
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

function getLine(prices, scales, size) {
  const line = [];

  // Starting position.
  line.push(`M ${size.left} ${size.height}`);
  line.push(`L ${size.left} ${yPos(prices[0], scales, size)}`);

  for (let i = 1; i < prices.length; i++) {
    // Horizontally to new X.
    line.push(
      `L ${xPos(i, scales, size)} ${yPos(prices[i - 1], scales, size)}`,
    );

    // Vertically to new Y.
    line.push(`L ${xPos(i, scales, size)} ${yPos(prices[i], scales, size)}`);
  }

  line.push(`L ${size.width - size.left} ${size.height}`);
  line.push(`L 0 ${size.height}`);

  return line.join(" ");
}

function graphSvg(index) {
  const { path, prices } = getPathData(index);
  const { size } = setupPath(path, index);
  const scales = getScales(prices, size);

  const line = getLine(prices, scales, size);
  path.setAttribute("d", line);
}

function drawPaths() {
  document.querySelectorAll("[id^=path-]").forEach((path) => {
    const index = path.id.replace("path-", "");
    graphSvg(index);
  });
}

document.addEventListener("DOMContentLoaded", drawPaths);
window.addEventListener("resize", function () {
  drawPaths();
});

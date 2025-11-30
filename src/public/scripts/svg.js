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
  let x, y_old, y;
  const r = 4;
  const line = [];

  // Starting position.
  y = yPos(prices[0], scales, size);
  line.push(`M ${size.left} ${size.height}`);
  line.push(`L ${size.left} ${y + r}`);
  line.push(`Q ${size.left} ${y} ${size.left + r} ${y}`);

  for (let i = 1; i < prices.length; i++) {
    x = xPos(i, scales, size);
    y_old = yPos(prices[i - 1], scales, size);
    y = yPos(prices[i], scales, size);

    if (y === y_old) {
      line.push(`H ${x}`);
      line.push(`V ${y}`);
      continue;
    }

    const dy = Math.abs(y - y_old);

    if (dy < 2 * r) {
      // When y-difference is small, use a single smooth S-curve.
      const actualR = dy / 2;
      line.push(`L ${x - r} ${y_old}`);
      line.push(
        `C ${x - r} ${y_old} ${x} ${y_old} ${x} ${y_old + (y > y_old ? actualR : -actualR)}`,
      );
      line.push(
        `C ${x} ${y - (y > y_old ? actualR : -actualR)} ${x} ${y} ${x + r} ${y}`,
      );
    } else {
      // When y-difference is large enough, use separate curves.
      line.push(`L ${x - r} ${y_old}`);
      if (y < y_old) {
        // Increase in price:
        line.push(`Q ${x} ${y_old} ${x} ${y_old - r}`);
        line.push(`V ${y + r}`);
        line.push(`Q ${x} ${y} ${x + r} ${y}`);
      } else {
        // Decrease in price:
        line.push(`Q ${x} ${y_old} ${x} ${y_old + r}`);
        line.push(`V ${y - r}`);
        line.push(`Q ${x} ${y} ${x + r} ${y}`);
      }
    }
  }

  x = xPos(prices.length - 1, scales, size);
  y = yPos(prices[prices.length - 1], scales, size);
  line.push(`L ${x - r} ${y}`);
  line.push(`Q ${x} ${y} ${x} ${y + r}`);
  line.push(`L ${x} ${size.height}`);
  line.push(`L ${size.left} ${size.height}`);

  return line.join(" ");
}

function addYAxisLabels(svg, prices, scales, size) {
  let values = new Set([
    Math.max(...prices),
    Math.min(...prices),
    prices.at(-1),
    prices.length > 1 ? prices.at(-2) : prices[0],
  ]);
  values = Array.from(values).sort((a, b) => a > b);

  svg.querySelectorAll(".ylabel").forEach((label) => label.remove());

  const attributes = {
    class: "ylabel",
    "dominant-baseline": "middle",
    "text-anchor": "start",
  };

  const x = size.width - size.right + 5; // Start just outside the drawing area
  const fragment = document.createDocumentFragment();

  const threshold =
    values.length > 2
      ? (Math.max(...values) - Math.min(...values)) / values.length
      : null;
  const labels = values.map((price) => ({
    value: price,
    y: yPos(price, scales, size),
  }));
  let previous = null;

  for (const price of labels) {
    // Skip values that are relatively close.
    if (previous && threshold && price.value - previous < threshold) continue;
    previous = price.value;

    const label = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text",
    );

    label.textContent = price.value;
    label.setAttribute("x", x);
    label.setAttribute("y", price.y);
    for (const [key, value] of Object.entries(attributes)) {
      label.setAttribute(key, value);
    }

    fragment.appendChild(label);
  }

  svg.appendChild(fragment);
}

function graphSvg(index) {
  const { path, prices } = getPathData(index);
  const { size } = setupPath(path, index);
  const scales = getScales(prices, size);

  const line = getLine(prices, scales, size);
  path.setAttribute("d", line);

  const svg = path.ownerSVGElement;
  addYAxisLabels(svg, prices, scales, size);
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

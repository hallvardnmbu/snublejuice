// Price history step line, drawn in pixels so the rounded corners are circular
// at any size. Each svg carries its prices in data-prices.
const HISTORY_PAD = 0.25; // share of the height kept free above and below the line
const HISTORY_RADIUS = 6;

function stepPath(prices, width, height, inset, closed) {
  const max = Math.max(...prices);
  const min = Math.min(...prices);
  const y = (price) =>
    max > min ? height * (HISTORY_PAD + ((max - price) / (max - min)) * (1 - 2 * HISTORY_PAD)) : height / 2;

  const left = inset;
  const right = width - inset;
  const column = (right - left) / prices.length;
  let previous = y(prices[0]);
  let path = `M${left} ${previous.toFixed(2)}`;

  for (let i = 1; i < prices.length; i++) {
    const next = y(prices[i]);
    const dy = next - previous;
    if (Math.abs(dy) > 1e-6) {
      const x = left + i * column;
      const r = Math.min(HISTORY_RADIUS, Math.abs(dy) / 2, column / 2);
      const dir = Math.sign(dy);
      path +=
        ` H${(x - r).toFixed(2)} Q${x.toFixed(2)} ${previous.toFixed(2)} ${x.toFixed(2)} ${(previous + dir * r).toFixed(2)}` +
        ` V${(next - dir * r).toFixed(2)} Q${x.toFixed(2)} ${next.toFixed(2)} ${(x + r).toFixed(2)} ${next.toFixed(2)}`;
    }
    previous = next;
  }

  path += ` H${right}`;
  return closed ? `${path} V${height} H0 Z` : path;
}

function drawHistory(svg) {
  const { width, height } = svg.getBoundingClientRect();
  if (!width || !height) return;
  const prices = svg.dataset.prices.split(",").map(Number);
  const cap = parseFloat(getComputedStyle(svg).getPropertyValue("--cap")) || 0;
  const closed = svg.classList.contains("area");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.querySelector("path").setAttribute("d", stepPath(prices, width, height, closed ? 0 : cap, closed));
}

const historyObserver = new ResizeObserver((entries) => entries.forEach((entry) => drawHistory(entry.target)));

function observeHistory(root) {
  root.querySelectorAll?.(".history svg[data-prices]").forEach((svg) => historyObserver.observe(svg));
}

new MutationObserver((mutations) => {
  for (const mutation of mutations) mutation.addedNodes.forEach((node) => observeHistory(node));
}).observe(document.documentElement, { childList: true, subtree: true });

observeHistory(document);

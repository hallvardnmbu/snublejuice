const _RESOLUTION = 4;

// Format the date to custom string.
function formatDateAsLocalString(date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  return `${year}-${month}`;
}

// Function to generate dates on the 1st of each month in local time
function generateDates(numPrices) {
  var dates = [];
  var currentDate = new Date();
  for (var i = 0; i < numPrices; i++) {
    var newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
    dates.unshift(formatDateAsLocalString(newDate));
  }
  return dates;
}

function graphPrice(index) {
  // Extract prices and dates from session storage
  const data = JSON.parse(sessionStorage.getItem(`${index}`));
  if (!data) {
    return;
  }
  const prices = data.price;
  const dates = data.date;

  // Color assigning based on the the discount sign.
  let color;
  if (prices.length > 2) {
    const oldPrice = prices[prices.length - 3];
    const newPrice = prices[prices.length - 2];

    if (oldPrice > newPrice) {
      color = {
        marker: "#00640099",
        line: "#00640033",
      };
    } else if (oldPrice < newPrice) {
      color = {
        marker: "#64000099",
        line: "#64000033",
      };
    } else {
      color = {
        marker: "#666666",
        line: "#cccccc",
      };
    }
  } else {
    color = {
      marker: "#666666",
      line: "#cccccc",
    };
  }

  var canvas = document.getElementById(`graph-${index}`);
  var ctx = canvas.getContext("2d");

  // Check if all prices are the same
  const allPricesEqual = prices.every((price) => price === prices[0]);

  // Resize canvas to fit container
  canvas.width = canvas.parentElement.clientWidth * _RESOLUTION;
  canvas.height = (allPricesEqual ? 70 : canvas.parentElement.clientHeight) * _RESOLUTION;
  canvas.style.width = `${canvas.width / _RESOLUTION}px`;
  canvas.style.height = `${canvas.height / _RESOLUTION}px`;

  // Calculate margins and plot area
  var margin = {
    top: 20 * _RESOLUTION,
    right: 10 * _RESOLUTION,
    bottom: 20 * _RESOLUTION,
    left: 40 * _RESOLUTION,
  };
  var plotWidth = canvas.width - margin.left - margin.right;
  var plotHeight = canvas.height - margin.top - margin.bottom;

  // Calculate scales
  var xScale = plotWidth / (dates.length - 1);
  var yMax = Math.max(...prices);
  var yMin = Math.min(...prices);

  // Check if all prices are the same
  var yScale = plotHeight / (yMax - yMin === 0 ? 1 : yMax - yMin);

  // Draw line
  ctx.beginPath();
  ctx.moveTo(margin.left, canvas.height - margin.bottom - (prices[0] - yMin) * yScale);
  for (var i = 1; i < prices.length; i++) {
    // Move horizontally to the new X position
    ctx.lineTo(
      margin.left + i * xScale,
      canvas.height - margin.bottom - (prices[i - 1] - yMin) * yScale,
    );
    // Move vertically to the new Y position
    ctx.lineTo(
      margin.left + i * xScale,
      canvas.height - margin.bottom - (prices[i] - yMin) * yScale,
    );
  }
  ctx.strokeStyle = color.line;
  ctx.lineWidth = 10 * _RESOLUTION;
  ctx.stroke();

  // Draw markers
  for (var i = 0; i < prices.length; i++) {
    ctx.beginPath();
    ctx.rect(
      margin.left + i * xScale - 5 * _RESOLUTION,
      canvas.height - margin.bottom - (prices[i] - yMin) * yScale - 5 * _RESOLUTION,
      10 * _RESOLUTION,
      10 * _RESOLUTION,
    );
    ctx.fillStyle = color.marker;
    ctx.fill();
  }

  // X-axis labels
  ctx.fillStyle = "black";
  ctx.textAlign = "center";
  ctx.font = `${14 * _RESOLUTION}px alpha-beta`;
  // Calculate the number of labels to show.
  const sampleDateWidth = ctx.measureText(dates[0]).width;
  const maxLabels = Math.floor(plotWidth / sampleDateWidth);
  const mod = Math.ceil(dates.length / maxLabels);
  for (var i = 0; i < dates.length; i++) {
    if ((i + 1) % mod === 0) {
      ctx.fillText(
        dates[i],
        margin.left + i * xScale,
        canvas.height - margin.bottom + 20 * _RESOLUTION,
      );
    }
  }

  // Y-axis labels
  ctx.fillStyle = "black";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (var i = 0; i <= 5; i++) {
    var yValue = yMin + ((yMax - yMin) * i) / 5;
    ctx.fillText(
      yValue.toFixed(0),
      margin.left - 10 * _RESOLUTION,
      canvas.height - margin.bottom - yScale * (yValue - yMin),
    );
  }

  // Hoverinfo
  const existingHoverLayer = canvas.parentElement.querySelector("canvas:not(#graph-" + index + ")");
  if (existingHoverLayer) {
    existingHoverLayer.remove();
  }
  let hoverLayer = document.createElement("canvas");
  hoverLayer.style.position = "absolute";
  hoverLayer.style.left = canvas.offsetLeft + "px";
  hoverLayer.style.top = canvas.offsetTop + "px";
  hoverLayer.width = canvas.width;
  hoverLayer.height = canvas.height;
  hoverLayer.style.width = canvas.style.width;
  hoverLayer.style.height = canvas.style.height;
  hoverLayer.style.pointerEvents = "none"; // Allow events to pass through to canvas underneath
  canvas.parentElement.appendChild(hoverLayer);
  let hoverCtx = hoverLayer.getContext("2d");

  // Add the listeners to the main canvas
  canvas.addEventListener("mousemove", function (event) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * _RESOLUTION;
    const y = (event.clientY - rect.top) * _RESOLUTION;

    const hoverIndex = Math.floor((x - margin.left) / xScale);
    if (hoverIndex >= 0 && hoverIndex < prices.length) {
      const hoverPrice = prices[hoverIndex];
      const hoverDate = dates[hoverIndex];

      // Clear previous hover info
      hoverCtx.clearRect(0, 0, hoverLayer.width, hoverLayer.height);

      // Draw hover info
      hoverCtx.fillStyle = "black";
      hoverCtx.textAlign = "left";
      hoverCtx.font = `${14 * _RESOLUTION}px alpha-beta`;
      hoverCtx.fillText(
        `${hoverPrice} kr (${hoverDate})`,
        x + 10 * _RESOLUTION,
        y - 10 * _RESOLUTION,
      );

      // Draw vertical line at mouse position
      hoverCtx.beginPath();
      hoverCtx.moveTo(x, 0);
      hoverCtx.lineTo(x, canvas.height);
      hoverCtx.strokeStyle = color.line;
      hoverCtx.lineWidth = 10 * _RESOLUTION;
      hoverCtx.stroke();
    } else {
      hoverCtx.clearRect(0, 0, hoverLayer.width, hoverLayer.height);
    }
  });

  // Clear hover info when mouse leaves the canvas
  canvas.addEventListener("mouseleave", function () {
    hoverCtx.clearRect(0, 0, hoverLayer.width, hoverLayer.height);
  });
}

window.addEventListener("resize", function () {
  const modals = document.getElementsByClassName("modal");
  for (const modal of modals) {
    if (modal.style.display === "block") {
      const index = parseInt(modal.id);
      graphPrice(index);
      break;
    }
  }
});

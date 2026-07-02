(function () {
  const container = document.getElementById("voxel_scanline_demo");
  if (!container) {
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.style.width = "100%";
  canvas.style.display = "block";
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;

  const cols = 8;
  const rows = 6;
  const cellSizeWorld = 1;
  const frameDurationMs = 820;
  const triangle = [
    { x: 0.55, z: 1.15 },
    { x: 6.7, z: 0.35 },
    { x: 3.45, z: 5.55 },
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function clipPoly(poly, pnx, pnz, pd) {
    if (!poly.length) {
      return [];
    }

    const d = poly.map((point) => pnx * point.x + pnz * point.z + pd);
    const out = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
      const ina = d[j] >= 0;
      const inb = d[i] >= 0;
      if (ina !== inb) {
        const s = d[j] / (d[j] - d[i]);
        out.push({
          x: lerp(poly[j].x, poly[i].x, s),
          z: lerp(poly[j].z, poly[i].z, s),
        });
      }
      if (inb) {
        out.push(poly[i]);
      }
    }
    return out;
  }

  function clipToRow(poly, row) {
    const cz = row * cellSizeWorld;
    const clippedMin = clipPoly(poly, 0, 1, -cz);
    if (clippedMin.length < 3) {
      return [];
    }
    return clipPoly(clippedMin, 0, -1, cz + cellSizeWorld);
  }

  function clipToColumn(poly, col) {
    const cx = col * cellSizeWorld;
    const clippedMin = clipPoly(poly, 1, 0, -cx);
    if (clippedMin.length < 3) {
      return [];
    }
    return clipPoly(clippedMin, -1, 0, cx + cellSizeWorld);
  }

  function getBounds(poly) {
    if (!poly.length) {
      return null;
    }

    let minX = poly[0].x;
    let maxX = poly[0].x;
    let minZ = poly[0].z;
    let maxZ = poly[0].z;
    for (let i = 1; i < poly.length; i += 1) {
      minX = Math.min(minX, poly[i].x);
      maxX = Math.max(maxX, poly[i].x);
      minZ = Math.min(minZ, poly[i].z);
      maxZ = Math.max(maxZ, poly[i].z);
    }
    return { minX, maxX, minZ, maxZ };
  }

  const triBounds = getBounds(triangle);
  const x0 = clamp(Math.floor(triBounds.minX), 0, cols - 1);
  const x1 = clamp(Math.floor(triBounds.maxX), 0, cols - 1);
  const y0 = clamp(Math.floor(triBounds.minZ), 0, rows - 1);
  const y1 = clamp(Math.floor(triBounds.maxZ), 0, rows - 1);

  const rowData = [];
  const frames = [];
  for (let row = y0; row <= y1; row += 1) {
    const rowPoly = clipToRow(triangle, row);
    if (rowPoly.length < 3) {
      continue;
    }

    const rowBounds = getBounds(rowPoly);
    const cells = [];
    for (let col = x0; col <= x1; col += 1) {
      const cellPoly = clipToColumn(rowPoly, col);
      const touched = cellPoly.length >= 3;
      cells.push({ col, cellPoly, touched });
    }

    const traversedCols = cells.filter((cell) => cell.touched).map((cell) => cell.col);
    if (!traversedCols.length) {
      continue;
    }

    const rowStartCol = traversedCols[0];
    const rowEndCol = traversedCols[traversedCols.length - 1];

    for (let col = rowStartCol; col <= rowEndCol; col += 1) {
      const cell = cells[col - x0];
      frames.push({
        row,
        col,
        rowPoly,
        rowBounds,
        rowStartCol,
        rowEndCol,
        cellPoly: cell.cellPoly,
        touched: cell.touched,
      });
    }

    rowData.push({ row, rowPoly, rowBounds, rowStartCol, rowEndCol, cells });
  }

  function getLayout(width) {
    if (width < 760) {
      return { columns: 2, rows: 2, height: 420 };
    }
    return { columns: 4, rows: 1, height: 250 };
  }

  function resizeCanvas() {
    const width = Math.max(320, Math.floor(container.clientWidth || 840));
    const layout = getLayout(width);
    canvas.style.height = `${layout.height}px`;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(layout.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function toCanvasPoint(originX, originY, cellSize, point) {
    return {
      x: originX + point.x * cellSize,
      y: originY + point.z * cellSize,
    };
  }

  function drawGrid(originX, originY, cellSize) {
    ctx.strokeStyle = "#d8d8d8";
    ctx.lineWidth = 1;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        ctx.strokeRect(originX + col * cellSize, originY + row * cellSize, cellSize, cellSize);
      }
    }
  }

  function drawPolygon(originX, originY, cellSize, poly, fillStyle, strokeStyle, lineWidth) {
    if (!poly.length) {
      return;
    }

    const start = toCanvasPoint(originX, originY, cellSize, poly[0]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < poly.length; i += 1) {
      const point = toCanvasPoint(originX, originY, cellSize, poly[i]);
      ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();

    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  function drawCellRect(originX, originY, cellSize, col, row, fillStyle, strokeStyle, lineWidth) {
    const x = originX + col * cellSize;
    const y = originY + row * cellSize;
    if (fillStyle) {
      ctx.fillStyle = fillStyle;
      ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
    }
    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
    }
  }

  function drawRowBand(originX, originY, cellSize, row, fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fillRect(originX, originY + row * cellSize, cols * cellSize, cellSize);
  }

  function drawColumnBand(originX, originY, cellSize, col, fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fillRect(originX + col * cellSize, originY, cellSize, rows * cellSize);
  }

  function drawHorizontalRange(originX, originY, cellSize, row, minX, maxX, color) {
    const midY = originY + (row + 0.5) * cellSize;
    const leftX = originX + minX * cellSize;
    const rightX = originX + maxX * cellSize;

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(leftX, midY);
    ctx.lineTo(rightX, midY);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(leftX, midY, 3.5, 0, Math.PI * 2);
    ctx.arc(rightX, midY, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawColumnTraversalRange(originX, originY, cellSize, row, startCol, endCol, color) {
    const midY = originY + (row + 0.5) * cellSize;
    const leftX = originX + startCol * cellSize;
    const rightX = originX + (endCol + 1) * cellSize;

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(leftX, midY);
    ctx.lineTo(rightX, midY);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(leftX, midY, 3.5, 0, Math.PI * 2);
    ctx.arc(rightX, midY, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawScanBounds(originX, originY, cellSize) {
    ctx.strokeStyle = "rgba(107, 114, 128, 0.75)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(
      originX + x0 * cellSize,
      originY + y0 * cellSize,
      (x1 - x0 + 1) * cellSize,
      (y1 - y0 + 1) * cellSize
    );
    ctx.setLineDash([]);
  }

  function drawPanelFrame(x, y, width, height, title, subtitle) {
    ctx.strokeStyle = "#ececec";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);

    ctx.fillStyle = "#333";
    ctx.font = "bold 13px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title, x + width * 0.5, y + height - 22);

    ctx.fillStyle = "#666";
    ctx.font = "12px Helvetica, Arial, sans-serif";
    ctx.fillText(subtitle, x + width * 0.5, y + height - 8);
  }

  function render() {
    const width = canvas.width / dpr;
    const layout = getLayout(width);
    const height = layout.height;
    ctx.clearRect(0, 0, width, height);

    if (!frames.length) {
      return;
    }

    const activeIndex = Math.floor(performance.now() / frameDurationMs) % frames.length;
    const activeFrame = frames[activeIndex];
    const completedRows = new Set();
    const completedTouchedCells = new Set();

    for (let i = 0; i < activeIndex; i += 1) {
      completedRows.add(frames[i].row);
      if (frames[i].touched) {
        completedTouchedCells.add(`${frames[i].col},${frames[i].row}`);
      }
    }

    const margin = 14;
    const gap = 18;
    const panelWidth = (width - margin * 2 - gap * (layout.columns - 1)) / layout.columns;
    const panelHeight = (height - 24 - gap * (layout.rows - 1)) / layout.rows;
    const gridAreaHeight = panelHeight - 48;
    const gridAreaWidth = panelWidth - 18;
    const cellSize = Math.min(gridAreaWidth / cols, gridAreaHeight / rows);
    const gridWidth = cols * cellSize;
    const gridHeight = rows * cellSize;

    const panels = [
      { title: "原始三角形", subtitle: "裁剪Box范围" },
      { title: "按 Z 行裁剪", subtitle: `按 z 获取 x 范围，y = ${activeFrame.row}，x = [${activeFrame.rowStartCol}, ${activeFrame.rowEndCol}]` },
      { title: "在该 x 范围内逐列裁剪", subtitle: `按 x 范围遍历 x = ${activeFrame.col}` },
      { title: "写入覆盖到 span", subtitle: "计算覆盖的 span" },
    ];

    for (let panel = 0; panel < panels.length; panel += 1) {
      const panelCol = panel % layout.columns;
      const panelRow = Math.floor(panel / layout.columns);
      const panelX = margin + panelCol * (panelWidth + gap);
      const panelY = 12 + panelRow * (panelHeight + gap);
      const originX = panelX + (panelWidth - gridWidth) * 0.5;
      const originY = panelY + 12;

      drawPanelFrame(panelX, panelY, panelWidth, panelHeight, panels[panel].title, panels[panel].subtitle);
      drawGrid(originX, originY, cellSize);

      if (panel === 0) {
        drawScanBounds(originX, originY, cellSize);
        drawPolygon(originX, originY, cellSize, triangle, "rgba(239, 68, 68, 0.18)", "#222", 2);
        continue;
      }

      if (panel === 1) {
        for (let i = 0; i < rowData.length; i += 1) {
          const rowInfo = rowData[i];
          if (rowInfo.row !== activeFrame.row && completedRows.has(rowInfo.row)) {
            drawRowBand(originX, originY, cellSize, rowInfo.row, "rgba(239, 68, 68, 0.08)");
            drawPolygon(originX, originY, cellSize, rowInfo.rowPoly, "rgba(239, 68, 68, 0.18)", "rgba(220, 38, 38, 0.55)", 1.5);
          }
        }

        drawRowBand(originX, originY, cellSize, activeFrame.row, "rgba(250, 204, 21, 0.16)");
        drawPolygon(originX, originY, cellSize, triangle, null, "rgba(107, 114, 128, 0.55)", 1.25);
        drawPolygon(originX, originY, cellSize, activeFrame.rowPoly, "rgba(37, 99, 235, 0.22)", "#2563eb", 2);
        drawHorizontalRange(originX, originY, cellSize, activeFrame.row, activeFrame.rowBounds.minX, activeFrame.rowBounds.maxX, "#dc2626");
        continue;
      }

      if (panel === 2) {
        drawRowBand(originX, originY, cellSize, activeFrame.row, "rgba(250, 204, 21, 0.12)");
        ctx.fillStyle = "rgba(220, 38, 38, 0.10)";
        ctx.fillRect(
          originX + activeFrame.rowStartCol * cellSize,
          originY + activeFrame.row * cellSize,
          (activeFrame.rowEndCol - activeFrame.rowStartCol + 1) * cellSize,
          cellSize
        );
        drawColumnBand(originX, originY, cellSize, activeFrame.col, "rgba(37, 99, 235, 0.12)");
        drawPolygon(originX, originY, cellSize, activeFrame.rowPoly, "rgba(239, 68, 68, 0.16)", "rgba(220, 38, 38, 0.6)", 1.5);
        drawColumnTraversalRange(originX, originY, cellSize, activeFrame.row, activeFrame.rowStartCol, activeFrame.rowEndCol, "rgba(220, 38, 38, 0.95)");
        if (activeFrame.touched) {
          drawPolygon(originX, originY, cellSize, activeFrame.cellPoly, "rgba(37, 99, 235, 0.38)", "#2563eb", 2);
        }
        drawCellRect(originX, originY, cellSize, activeFrame.col, activeFrame.row, null, activeFrame.touched ? "#2563eb" : "rgba(107, 114, 128, 0.7)", 2);
        continue;
      }

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const key = `${col},${row}`;
          if (completedTouchedCells.has(key)) {
            drawCellRect(originX, originY, cellSize, col, row, "rgba(239, 68, 68, 0.78)", "#dc2626", 1.5);
          }
        }
      }

      if (activeFrame.touched) {
        drawCellRect(originX, originY, cellSize, activeFrame.col, activeFrame.row, "rgba(37, 99, 235, 0.78)", "#1d4ed8", 2);
      } else {
        drawCellRect(originX, originY, cellSize, activeFrame.col, activeFrame.row, "rgba(148, 163, 184, 0.18)", "rgba(100, 116, 139, 0.7)", 2);
      }

      drawPolygon(originX, originY, cellSize, triangle, null, "rgba(107, 114, 128, 0.45)", 1.25);
    }

    requestAnimationFrame(render);
  }

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  render();
})();

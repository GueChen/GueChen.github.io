(function () {
  const DEFAULT_SIZE = 10;
  const PHASES = ["prepare", "boundary", "pass1", "pass2", "erode"];
  const PHASE_LABELS = {
    prepare: "Prepare",
    boundary: "Boundary",
    pass1: "Pass 1",
    pass2: "Pass 2",
    erode: "Erode",
  };
  const PHASE_STATUS_LABELS = {
    prepare: "准备阶段",
    boundary: "边界标记",
    pass1: "第一次遍历",
    pass2: "第二次遍历",
    erode: "腐蚀过滤",
  };
  const PHASE_DESCRIPTIONS = {
    prepare:
      "准备阶段：先初始化可行走块；此时还没有开始边界标记，也没有传播距离值。",
    boundary:
      "边界标记：障碍块以及四邻域缺失的可行走块会被置为 0；内部块保持为 inf。",
    pass1:
      "第一次遍历：按从左上到右下扫描，采样西侧/北侧邻居记为 +2，西北/东北对角邻居记为 +3。",
    pass2:
      "第二次遍历：按从右下到左上扫描，采样东侧/南侧邻居记为 +2，东南/西南对角邻居记为 +3。",
    erode:
      "腐蚀过滤：距离值小于 walkableRadius * 2 的块会被从可行走区域中移除。",
  };

  function toIndex(size, x, y) {
    return y * size + x;
  }

  function inBounds(size, x, y) {
    return x >= 0 && x < size && y >= 0 && y < size;
  }

  function isWalkable(cells, size, x, y) {
    return inBounds(size, x, y) && cells[toIndex(size, x, y)];
  }

  function formatValue(value) {
    return Number.isFinite(value) ? String(value) : "inf";
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function distancesEqual(a, b) {
    if (!Number.isFinite(a) && !Number.isFinite(b)) {
      return true;
    }

    return a === b;
  }

  function createChangedMask(length, changedIndex, enabled, previousChanged = null) {
    const changed = previousChanged ? previousChanged.slice() : Array(length).fill(false);
    if (enabled && changedIndex >= 0) {
      changed[changedIndex] = true;
    }
    return changed;
  }

  function createFrame(distance, eroded, changedIndex, enabled, focus = [], previousChanged = null, centerIndex = -1) {
    return {
      distance: distance.slice(),
      eroded: eroded.slice(),
      changed: createChangedMask(distance.length, changedIndex, enabled, previousChanged),
      focus,
      centerIndex,
    };
  }

  function collectIndices(size, coords) {
    const indices = [];
    for (let i = 0; i < coords.length; i += 1) {
      const [x, y] = coords[i];
      if (inBounds(size, x, y)) {
        indices.push(toIndex(size, x, y));
      }
    }
    return indices;
  }

  function createExampleCells(size) {
    const cells = Array(size * size).fill(true);
    const blocked = [
      [2, 2], [3, 2], [2, 3],
      [6, 2], [7, 2], [7, 3],
      [4, 5], [5, 5], [5, 6],
      [2, 7], [3, 7], [7, 7],
    ];

    blocked.forEach(([x, y]) => {
      if (inBounds(size, x, y)) {
        cells[toIndex(size, x, y)] = false;
      }
    });

    return cells;
  }

  function markBoundaries(cells, size) {
    const dist = Array(size * size).fill(Number.POSITIVE_INFINITY);

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const idx = toIndex(size, x, y);
        if (!cells[idx]) {
          dist[idx] = 0;
          continue;
        }

        let cardinalCount = 0;
        cardinalCount += isWalkable(cells, size, x - 1, y) ? 1 : 0;
        cardinalCount += isWalkable(cells, size, x + 1, y) ? 1 : 0;
        cardinalCount += isWalkable(cells, size, x, y - 1) ? 1 : 0;
        cardinalCount += isWalkable(cells, size, x, y + 1) ? 1 : 0;

        if (cardinalCount !== 4) {
          dist[idx] = 0;
        }
      }
    }

    return dist;
  }

  function relaxForward(dist, cells, size, x, y) {
    const idx = toIndex(size, x, y);
    if (!cells[idx]) {
      return;
    }

    if (isWalkable(cells, size, x - 1, y)) {
      const west = toIndex(size, x - 1, y);
      dist[idx] = Math.min(dist[idx], dist[west] + 2);

      if (isWalkable(cells, size, x - 1, y - 1) && isWalkable(cells, size, x, y - 1)) {
        dist[idx] = Math.min(dist[idx], dist[toIndex(size, x - 1, y - 1)] + 3);
      }
    }

    if (isWalkable(cells, size, x, y - 1)) {
      const north = toIndex(size, x, y - 1);
      dist[idx] = Math.min(dist[idx], dist[north] + 2);

      if (isWalkable(cells, size, x + 1, y - 1) && isWalkable(cells, size, x + 1, y)) {
        dist[idx] = Math.min(dist[idx], dist[toIndex(size, x + 1, y - 1)] + 3);
      }
    }
  }

  function relaxBackward(dist, cells, size, x, y) {
    const idx = toIndex(size, x, y);
    if (!cells[idx]) {
      return;
    }

    if (isWalkable(cells, size, x + 1, y)) {
      const east = toIndex(size, x + 1, y);
      dist[idx] = Math.min(dist[idx], dist[east] + 2);

      if (isWalkable(cells, size, x + 1, y + 1) && isWalkable(cells, size, x, y + 1)) {
        dist[idx] = Math.min(dist[idx], dist[toIndex(size, x + 1, y + 1)] + 3);
      }
    }

    if (isWalkable(cells, size, x, y + 1)) {
      const south = toIndex(size, x, y + 1);
      dist[idx] = Math.min(dist[idx], dist[south] + 2);

      if (isWalkable(cells, size, x - 1, y + 1) && isWalkable(cells, size, x - 1, y)) {
        dist[idx] = Math.min(dist[idx], dist[toIndex(size, x - 1, y + 1)] + 3);
      }
    }
  }

  function simulateDistanceField(cells, size, walkableRadius) {
    const prepare = cells.map((walkable) => (walkable ? Number.POSITIVE_INFINITY : 0));
    const boundary = prepare.slice();
    const pass1 = boundary.slice();
    const pass2 = boundary.slice();
    const initialEroded = cells.slice();
    const frames = {
      prepare: [createFrame(prepare, initialEroded, -1, false)],
      boundary: [],
      pass1: [],
      pass2: [],
      erode: [],
    };
    let boundaryChangedMask = Array(cells.length).fill(false);
    let pass1ChangedMask = Array(cells.length).fill(false);
    let pass2ChangedMask = Array(cells.length).fill(false);
    let erodeChangedMask = Array(cells.length).fill(false);

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const idx = toIndex(size, x, y);
        const before = boundary[idx];

        if (!cells[idx]) {
          boundary[idx] = 0;
        } else {
          let cardinalCount = 0;
          cardinalCount += isWalkable(cells, size, x - 1, y) ? 1 : 0;
          cardinalCount += isWalkable(cells, size, x + 1, y) ? 1 : 0;
          cardinalCount += isWalkable(cells, size, x, y - 1) ? 1 : 0;
          cardinalCount += isWalkable(cells, size, x, y + 1) ? 1 : 0;

          if (cardinalCount !== 4) {
            boundary[idx] = 0;
          }
        }

        const focus = collectIndices(size, [
          [x, y],
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ]);
        const changed = !distancesEqual(before, boundary[idx]);
        boundaryChangedMask = createChangedMask(cells.length, idx, changed, boundaryChangedMask);
        frames.boundary.push(createFrame(boundary, initialEroded, idx, changed, focus, boundaryChangedMask, idx));
      }
    }

    for (let i = 0; i < pass1.length; i += 1) {
      pass1[i] = boundary[i];
    }

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const idx = toIndex(size, x, y);
        const before = pass1[idx];
        relaxForward(pass1, cells, size, x, y);
        const focus = collectIndices(size, [
          [x - 1, y - 1],
          [x, y - 1],
          [x + 1, y - 1],
          [x - 1, y],
          [x, y],
        ]);
        const changed = !distancesEqual(before, pass1[idx]);
        pass1ChangedMask = createChangedMask(cells.length, idx, changed, pass1ChangedMask);
        frames.pass1.push(createFrame(pass1, initialEroded, idx, changed, focus, pass1ChangedMask, idx));
      }
    }

    for (let i = 0; i < pass1.length; i += 1) {
      pass2[i] = pass1[i];
    }

    for (let y = size - 1; y >= 0; y -= 1) {
      for (let x = size - 1; x >= 0; x -= 1) {
        const idx = toIndex(size, x, y);
        const before = pass2[idx];
        relaxBackward(pass2, cells, size, x, y);
        const focus = collectIndices(size, [
          [x, y],
          [x + 1, y],
          [x - 1, y + 1],
          [x, y + 1],
          [x + 1, y + 1],
        ]);
        const changed = !distancesEqual(before, pass2[idx]);
        pass2ChangedMask = createChangedMask(cells.length, idx, changed, pass2ChangedMask);
        frames.pass2.push(createFrame(pass2, initialEroded, idx, changed, focus, pass2ChangedMask, idx));
      }
    }

    const eroded = cells.map((walkable, index) => walkable && pass2[index] >= walkableRadius * 2);
    const prepareChanged = cells.map(() => false);
    const boundaryChanged = boundary.map((distance, index) => cells[index] && Number.isFinite(distance));
    const pass1Changed = pass1.map((distance, index) => cells[index] && !distancesEqual(distance, boundary[index]));
    const pass2Changed = pass2.map((distance, index) => cells[index] && !distancesEqual(distance, pass1[index]));
    const animatedEroded = cells.slice();

    for (let i = 0; i < animatedEroded.length; i += 1) {
      const before = animatedEroded[i];
      animatedEroded[i] = eroded[i];
      const changed = before !== animatedEroded[i];
      erodeChangedMask = createChangedMask(cells.length, i, changed, erodeChangedMask);
      frames.erode.push(createFrame(pass2, animatedEroded, i, changed, [i], erodeChangedMask, i));
    }

    return { prepare, boundary, pass1, pass2, eroded, prepareChanged, boundaryChanged, pass1Changed, pass2Changed, frames };
  }

  function buildWidget(root) {
    const size = parseInt(root.getAttribute("data-size"), 10) || DEFAULT_SIZE;
    const state = {
      root,
      size,
      walkableRadius: 2,
      activePhase: "prepare",
      cells: createExampleCells(size),
      resetCells: createExampleCells(size),
      paintValue: null,
      isPointerDown: false,
      playTimer: null,
      playSequence: null,
      playCursor: -1,
      frameIndex: null,
      elements: {},
    };

    root.innerHTML = `
      <div class="inline-grid-widget">
        <div class="inline-grid-toolbar">
          <button type="button" class="inline-grid-button" data-action="reset">Reset Example</button>
          <button type="button" class="inline-grid-button" data-action="play">Play Passes</button>
          <label class="inline-grid-radius">
            行走半径
            <input type="range" min="1" max="4" step="1" value="${state.walkableRadius}" data-role="radius">
            <span data-role="radius-value">${state.walkableRadius}</span>
          </label>
        </div>
        <div class="inline-grid-phases">
          ${PHASES.map((phase) => `<button type="button" class="inline-grid-phase" data-phase="${phase}">${PHASE_LABELS[phase]}</button>`).join("")}
        </div>
        <div class="inline-grid-status">
          <strong data-role="phase-title"></strong>
          <span data-role="phase-text"></span>
        </div>
        <div class="distance-grid-wrap">
          <div class="distance-grid" data-role="grid"></div>
          <div class="distance-grid-focus" data-role="focus"></div>
        </div>
        <div class="inline-grid-legend">
          <span><i class="legend-chip is-blocked"></i> 障碍 / 不可行走</span>
          <span><i class="legend-chip is-safe"></i> 可行走区域</span>
          <span><i class="legend-chip is-updated"></i> 当前遍历已更新</span>
          <span><i class="legend-chip is-infinite"></i> inf / 内部区域</span>
          <span><i class="legend-chip is-eroded"></i> 腐蚀后移除</span>
        </div>
      </div>
    `;

    state.elements.grid = root.querySelector('[data-role="grid"]');
    state.elements.phaseTitle = root.querySelector('[data-role="phase-title"]');
    state.elements.phaseText = root.querySelector('[data-role="phase-text"]');
    state.elements.radius = root.querySelector('[data-role="radius"]');
    state.elements.radiusValue = root.querySelector('[data-role="radius-value"]');
    state.elements.phaseButtons = root.querySelectorAll(".inline-grid-phase");
    state.elements.play = root.querySelector('[data-action="play"]');
    state.elements.reset = root.querySelector('[data-action="reset"]');
    state.elements.widget = root.querySelector(".inline-grid-widget");
    state.elements.focus = root.querySelector('[data-role="focus"]');

    state.elements.grid.style.gridTemplateColumns = `repeat(${size}, var(--cell-size))`;
    state.elements.grid.style.gridTemplateRows = `repeat(${size}, var(--cell-size))`;

    attachResponsiveLayout(state);

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "cell";
        cell.dataset.index = String(toIndex(size, x, y));
        cell.addEventListener("pointerdown", () => {
          const index = Number(cell.dataset.index);
          state.paintValue = !state.cells[index];
          state.isPointerDown = true;
          setCellWalkable(state, index, state.paintValue);
        });
        cell.addEventListener("pointerenter", () => {
          if (!state.isPointerDown || state.paintValue === null) {
            return;
          }

          const index = Number(cell.dataset.index);
          setCellWalkable(state, index, state.paintValue);
        });
        state.elements.grid.appendChild(cell);
      }
    }

    root.addEventListener("pointerup", () => {
      state.isPointerDown = false;
      state.paintValue = null;
    });

    document.addEventListener("pointerup", () => {
      state.isPointerDown = false;
      state.paintValue = null;
    });

    state.elements.radius.addEventListener("input", () => {
      stopPlayback(state, true);
      state.walkableRadius = parseInt(state.elements.radius.value, 10);
      state.elements.radiusValue.textContent = String(state.walkableRadius);
      rerender(state);
    });

    state.elements.reset.addEventListener("click", () => {
      stopPlayback(state, true);
      state.cells = state.resetCells.slice();
      state.activePhase = "prepare";
      rerender(state);
    });

    state.elements.play.addEventListener("click", () => {
      if (state.playTimer) {
        pausePlayback(state);
        return;
      }

      startLoopPlayback(state);
    });

    state.elements.phaseButtons.forEach((button) => {
      button.addEventListener("click", () => {
        stopPlayback(state, true);
        state.activePhase = button.dataset.phase;
        rerender(state);
      });
    });

    rerender(state);
  }

  function attachResponsiveLayout(state) {
    const update = () => updateResponsiveLayout(state);

    update();

    if (typeof ResizeObserver !== "undefined") {
      state.resizeObserver = new ResizeObserver(update);
      state.resizeObserver.observe(state.root);
      return;
    }

    window.addEventListener("resize", update);
  }

  function updateResponsiveLayout(state) {
    const widget = state.elements.widget;
    const width = state.root.clientWidth || widget.clientWidth;
    if (!width) {
      return;
    }

    const minCellSize = 18;
    const maxCellSize = 42;
    const gap = clamp(Math.floor(width / 95), 2, 4);
    const horizontalPadding = clamp(Math.round(width * 0.04), 10, 14) * 2;
    const availableForGrid = Math.max(width - horizontalPadding, 180);
    const cellSize = clamp(
      Math.floor((availableForGrid - gap * (state.size - 1)) / state.size),
      minCellSize,
      maxCellSize,
    );
    const idealWidth = state.size * maxCellSize + (state.size - 1) * 4 + 28;
    const scale = clamp(width / idealWidth, 0.78, 1);

    state.root.style.setProperty("--cell-size", `${cellSize}px`);
    state.root.style.setProperty("--grid-gap", `${gap}px`);
    state.root.style.setProperty("--demo-scale", scale.toFixed(3));
  }

  function buildPlaySequence(state) {
    const result = simulateDistanceField(state.cells, state.size, state.walkableRadius);
    const sequence = [];

    PHASES.forEach((phase) => {
      const frames = result.frames[phase];
      for (let i = 0; i < frames.length; i += 1) {
        sequence.push({ phase, frameIndex: i });
      }
    });

    return sequence;
  }

  function syncPlaybackFrame(state) {
    if (!state.playSequence || state.playCursor < 0 || state.playCursor >= state.playSequence.length) {
      return false;
    }

    const current = state.playSequence[state.playCursor];
    state.activePhase = current.phase;
    state.frameIndex = current.frameIndex;
    return true;
  }

  function setPlayButtonLabel(state, label) {
    state.elements.play.textContent = label;
  }

  function startLoopPlayback(state) {
    if (!state.playSequence || state.playCursor < 0 || state.frameIndex === null) {
      state.playSequence = buildPlaySequence(state);
      state.playCursor = state.playSequence.findIndex((entry) => entry.phase === state.activePhase);
      if (state.playCursor < 0) {
        state.playCursor = 0;
      }
      syncPlaybackFrame(state);
      rerender(state);
    }

    setPlayButtonLabel(state, "Pause");
    state.playTimer = window.setInterval(() => {
      state.playCursor = (state.playCursor + 1) % state.playSequence.length;
      syncPlaybackFrame(state);
      rerender(state);
    }, 90);
  }

  function pausePlayback(state) {
    if (state.playTimer) {
      window.clearInterval(state.playTimer);
      state.playTimer = null;
    }
    setPlayButtonLabel(state, state.frameIndex === null ? "Play Passes" : "Continue");
  }

  function stopPlayback(state, clearFrame) {
    pausePlayback(state);
    if (clearFrame) {
      state.playSequence = null;
      state.playCursor = -1;
      state.frameIndex = null;
    }
    setPlayButtonLabel(state, "Play Passes");
  }

  function setCellWalkable(state, index, walkable) {
    stopPlayback(state, true);
    state.cells[index] = walkable;
    rerender(state);
  }

  function getCellClasses(snapshot, state, index) {
    const classes = [];
    const isWalkableCell = state.cells[index];
    const distance = snapshot.distance[index];

    if (!isWalkableCell) {
      classes.push("is-blocked");
      return classes;
    }

    if (Number.isFinite(distance)) {
      classes.push("is-safe");
      if (distance >= state.walkableRadius * 2 + 2) {
        classes.push("is-deep");
      }
    } else {
      classes.push("is-infinite");
    }

    if (state.activePhase === "erode" && !snapshot.eroded[index]) {
      classes.push("is-eroded");
    }

    if (snapshot.changed[index] && !(state.activePhase === "erode" && !snapshot.eroded[index])) {
      classes.push("is-updated");
    }

    return classes;
  }

  function getSnapshotForPhase(result, phase, frameIndex) {
    if (frameIndex !== null && frameIndex !== undefined) {
      const frames = result.frames[phase];
      if (frames && frames[frameIndex]) {
        return frames[frameIndex];
      }
    }

    switch (phase) {
      case "pass1":
        return { distance: result.pass1, eroded: result.eroded, changed: result.pass1Changed, focus: [] };
      case "pass2":
        return { distance: result.pass2, eroded: result.eroded, changed: result.pass2Changed, focus: [] };
      case "erode":
        return { distance: result.pass2, eroded: result.eroded, changed: result.pass2Changed, focus: [] };
      case "prepare":
        return { distance: result.prepare, eroded: result.eroded, changed: result.prepareChanged, focus: [] };
      case "boundary":
      default:
        return { distance: result.boundary, eroded: result.eroded, changed: result.boundaryChanged, focus: [] };
    }
  }

  function updateFocusOverlay(state, snapshot, cells) {
    const overlay = state.elements.focus;
    const focus = snapshot.focus || [];

    if (state.frameIndex === null || focus.length === 0) {
      overlay.style.display = "none";
      return;
    }

    let minLeft = Number.POSITIVE_INFINITY;
    let minTop = Number.POSITIVE_INFINITY;
    let maxRight = Number.NEGATIVE_INFINITY;
    let maxBottom = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < focus.length; i += 1) {
      const cell = cells[focus[i]];
      if (!cell) {
        continue;
      }

      minLeft = Math.min(minLeft, cell.offsetLeft);
      minTop = Math.min(minTop, cell.offsetTop);
      maxRight = Math.max(maxRight, cell.offsetLeft + cell.offsetWidth);
      maxBottom = Math.max(maxBottom, cell.offsetTop + cell.offsetHeight);
    }

    if (!Number.isFinite(minLeft)) {
      overlay.style.display = "none";
      return;
    }

    overlay.style.display = "block";
    overlay.style.left = `${minLeft - 3}px`;
    overlay.style.top = `${minTop - 3}px`;
    overlay.style.width = `${maxRight - minLeft + 6}px`;
    overlay.style.height = `${maxBottom - minTop + 6}px`;
  }

  function rerender(state) {
    const result = simulateDistanceField(state.cells, state.size, state.walkableRadius);
    const snapshot = getSnapshotForPhase(result, state.activePhase, state.frameIndex);
    const cells = state.elements.grid.querySelectorAll(".cell");
    const focusSet = new Set(snapshot.focus || []);

    state.elements.phaseTitle.textContent = PHASE_STATUS_LABELS[state.activePhase];
    state.elements.phaseText.textContent = PHASE_DESCRIPTIONS[state.activePhase];

    state.elements.phaseButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.phase === state.activePhase);
    });

    for (let i = 0; i < cells.length; i += 1) {
      const cell = cells[i];
      const distance = snapshot.distance[i];
      const walkable = state.cells[i];

      cell.className = "cell";
      getCellClasses(snapshot, state, i).forEach((className) => cell.classList.add(className));
      if (state.frameIndex !== null && snapshot.centerIndex === i) {
        cell.classList.add("is-center");
      }
      cell.title = `(${i % state.size}, ${Math.floor(i / state.size)})`;

      if (!walkable) {
        cell.textContent = "X";
      } else if (state.activePhase === "erode" && !snapshot.eroded[i]) {
        cell.textContent = formatValue(distance);
      } else {
        cell.textContent = formatValue(distance);
      }
    }

    updateFocusOverlay(state, snapshot, cells);
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".inline-grid").forEach((root) => {
      buildWidget(root);
    });
  });
})();

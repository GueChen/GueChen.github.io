(function () {
  const DEFAULT_SIZE = 10;
  const PHASES = ["boundary", "pass1", "pass2", "erode"];
  const PHASE_LABELS = {
    boundary: "Boundary",
    pass1: "Pass 1",
    pass2: "Pass 2",
    erode: "Erode",
  };
  const PHASE_DESCRIPTIONS = {
    boundary:
      "Boundary initialization: blocked cells and walkable cells missing one of the 4 neighbors are set to 0; interior cells start as infinity.",
    pass1:
      "Forward pass: scan from top-left to bottom-right, sampling W/N with cost +2 and NW/NE with cost +3.",
    pass2:
      "Backward pass: scan from bottom-right to top-left, sampling E/S with cost +2 and SE/SW with cost +3.",
    erode:
      "Erosion: cells with distance < walkableRadius * 2 are removed from the walkable area.",
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
    const boundary = markBoundaries(cells, size);
    const pass1 = boundary.slice();
    const pass2 = boundary.slice();

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        relaxForward(pass1, cells, size, x, y);
      }
    }

    for (let i = 0; i < pass1.length; i += 1) {
      pass2[i] = pass1[i];
    }

    for (let y = size - 1; y >= 0; y -= 1) {
      for (let x = size - 1; x >= 0; x -= 1) {
        relaxBackward(pass2, cells, size, x, y);
      }
    }

    const eroded = cells.map((walkable, index) => walkable && pass2[index] >= walkableRadius * 2);
    return { boundary, pass1, pass2, eroded };
  }

  function buildWidget(root) {
    const size = parseInt(root.getAttribute("data-size"), 10) || DEFAULT_SIZE;
    const state = {
      root,
      size,
      walkableRadius: 2,
      activePhase: "boundary",
      cells: createExampleCells(size),
      resetCells: createExampleCells(size),
      paintValue: null,
      isPointerDown: false,
      playTimer: null,
      elements: {},
    };

    root.innerHTML = `
      <div class="inline-grid-widget">
        <div class="inline-grid-toolbar">
          <button type="button" class="inline-grid-button" data-action="reset">Reset Example</button>
          <button type="button" class="inline-grid-button" data-action="play">Play Passes</button>
          <label class="inline-grid-radius">
            walkableRadius
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
        <div class="distance-grid" data-role="grid"></div>
        <div class="inline-grid-legend">
          <span><i class="legend-chip is-blocked"></i> blocked / obstacle</span>
          <span><i class="legend-chip is-boundary"></i> boundary distance = 0</span>
          <span><i class="legend-chip is-safe"></i> larger distance = safer</span>
          <span><i class="legend-chip is-eroded"></i> removed after erosion</span>
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

    state.elements.grid.style.gridTemplateColumns = `repeat(${size}, var(--cell-size))`;
    state.elements.grid.style.gridTemplateRows = `repeat(${size}, var(--cell-size))`;

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
      state.walkableRadius = parseInt(state.elements.radius.value, 10);
      state.elements.radiusValue.textContent = String(state.walkableRadius);
      rerender(state);
    });

    state.elements.reset.addEventListener("click", () => {
      stopPlayback(state);
      state.cells = state.resetCells.slice();
      state.activePhase = "boundary";
      rerender(state);
    });

    state.elements.play.addEventListener("click", () => {
      if (state.playTimer) {
        stopPlayback(state);
        return;
      }

      let phaseIndex = PHASES.indexOf(state.activePhase);
      state.elements.play.textContent = "Stop";
      state.playTimer = window.setInterval(() => {
        phaseIndex = (phaseIndex + 1) % PHASES.length;
        state.activePhase = PHASES[phaseIndex];
        rerender(state);
      }, 900);
    });

    state.elements.phaseButtons.forEach((button) => {
      button.addEventListener("click", () => {
        stopPlayback(state);
        state.activePhase = button.dataset.phase;
        rerender(state);
      });
    });

    rerender(state);
  }

  function stopPlayback(state) {
    if (state.playTimer) {
      window.clearInterval(state.playTimer);
      state.playTimer = null;
    }
    state.elements.play.textContent = "Play Passes";
  }

  function setCellWalkable(state, index, walkable) {
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

    if (distance === 0) {
      classes.push("is-boundary");
    } else if (Number.isFinite(distance)) {
      classes.push("is-safe");
      if (distance >= state.walkableRadius * 2 + 2) {
        classes.push("is-deep");
      }
    }

    if (state.activePhase === "erode" && !snapshot.eroded[index]) {
      classes.push("is-eroded");
    }

    return classes;
  }

  function getSnapshotForPhase(result, phase) {
    switch (phase) {
      case "pass1":
        return { distance: result.pass1, eroded: result.eroded };
      case "pass2":
        return { distance: result.pass2, eroded: result.eroded };
      case "erode":
        return { distance: result.pass2, eroded: result.eroded };
      case "boundary":
      default:
        return { distance: result.boundary, eroded: result.eroded };
    }
  }

  function rerender(state) {
    const result = simulateDistanceField(state.cells, state.size, state.walkableRadius);
    const snapshot = getSnapshotForPhase(result, state.activePhase);
    const cells = state.elements.grid.querySelectorAll(".cell");

    state.elements.phaseTitle.textContent = PHASE_LABELS[state.activePhase];
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
      cell.title = `(${i % state.size}, ${Math.floor(i / state.size)})`;

      if (!walkable) {
        cell.textContent = "X";
      } else if (state.activePhase === "erode" && !snapshot.eroded[i]) {
        cell.textContent = formatValue(distance);
      } else {
        cell.textContent = formatValue(distance);
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".inline-grid").forEach((root) => {
      buildWidget(root);
    });
  });
})();

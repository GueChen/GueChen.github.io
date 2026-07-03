(function () {
  const conflictHost = document.getElementById("flood_region_conflict_demo");
  const fillHost = document.getElementById("flood_region_fill_demo");
  if (!conflictHost && !fillHost) {
    return;
  }

  const styleId = "flood-region-demo-style";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .flood-demo-card {
        max-width: 430px;
        margin: 0 auto;
        padding: 14px;
        border-radius: 14px;
        background: #f8fafc;
        border: 1px solid rgba(148, 163, 184, 0.28);
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
        color: #1f2937;
      }
      .flood-demo-title {
        margin: 0;
        text-align: center;
        font-size: 15px;
        font-weight: 700;
        color: #0f172a;
      }
      .flood-demo-step {
        margin: 0;
        width: 100%;
        display: flex;
        align-items: baseline;
        justify-content: flex-start;
        gap: 6px;
        text-align: left;
        font-size: 12px;
        font-weight: 700;
        color: #0369a1;
      }
      .flood-demo-step-prefix {
        flex: 0 0 auto;
        white-space: nowrap;
      }
      .flood-demo-step-text {
        flex: 1 1 auto;
        min-width: 0;
        text-align: center;
      }
      .flood-demo-content {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 52px;
        grid-template-rows: auto auto;
        column-gap: 14px;
        row-gap: 8px;
        align-items: start;
        margin-bottom: 0;
      }
      .flood-demo-left {
        grid-column: 1;
        grid-row: 2;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        width: 100%;
      }
      .flood-demo-stack {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        gap: 6px;
        margin: 0;
        flex: 0 0 48px;
        width: 48px;
        grid-column: 2;
        grid-row: 2;
      }
      .flood-demo-stack-label {
        font-size: 12px;
        font-weight: 700;
        color: #0f172a;
        text-align: center;
        grid-column: 2;
        grid-row: 1;
        align-self: center;
      }
      .flood-demo-stack-box {
        width: 24px;
        height: 24px;
        border-radius: 6px;
        background: #fb923c;
        border: 1px solid rgba(194, 65, 12, 0.35);
      }
      .flood-demo-stack-box.is-active {
        background: #f97316;
        box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.18);
      }
      .flood-demo-grid {
        display: grid;
        grid-template-columns: repeat(3, 42px);
        gap: 5px;
        justify-content: center;
        padding: 8px;
        margin: 0;
      }
      .flood-demo-cell {
        width: 42px;
        height: 42px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        color: #f8fafc;
        font: 700 12px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        transition: transform 0.22s ease, box-shadow 0.22s ease, background-color 0.22s ease;
      }
      .flood-demo-cell.is-focus {
        transform: scale(1.05);
        box-shadow: 0 0 0 3px rgba(219, 17, 10, 0.69);
      }
      .flood-demo-cell.is-blocked { background: #4b5563; color: #cbd5e1; }
      .flood-demo-cell.is-empty { background: #1d4f91; }
      .flood-demo-cell.is-other { background: #2f9e44; }
      .flood-demo-cell.is-seed { background: #d97706; }
      .flood-demo-cell.is-new { background: #d9a106fa; }
      .flood-demo-cell.is-low { background: #64748b; }
      .flood-demo-cell.is-rejected {
        background: #7c3aed;
        position: relative;
      }
      .flood-demo-cell.is-rejected::before {
        content: "";
        position: absolute;
        inset: 7px;
        border: 2px solid rgba(255,255,255,0.9);
        border-radius: 8px;
        transform: rotate(45deg);
      }
    `;
    document.head.appendChild(style);
  }

  const conflictSteps = [
    {
      step: "Step 1：开始遍历",
      stackCount: 1,
      activeStackIndex: 0,
      focus: [],
      grid: [
        ["blocked", "empty", "other"],
        ["blocked", "seed", "blocked"],
        ["blocked", "blocked", "blocked"],
      ],
    },
    {
      step: "Step 2：（1,1）为栈顶",
      stackCount: 1,
      activeStackIndex: 1,
      focus: ["1,1"],
      grid: [
        ["blocked", "empty", "other"],
        ["blocked", "seed", "blocked"],
        ["blocked", "blocked", "blocked"],
      ],
    },
    {
      step: "Step 3：检查四邻居，上邻域连通",
      stackCount: 1,
      activeStackIndex: 1,
      focus: ["1,0"],
      grid: [
        ["blocked", "empty", "other"],
        ["blocked", "seed", "blocked"],
        ["blocked", "blocked", "blocked"],
      ],
    },
    {
      step: "Step 4：检查八邻居，右上邻域连通，且已有归属",
      stackCount: 1,
      activeStackIndex: 1,
      focus: ["2,0"],
      grid: [
        ["blocked", "empty", "other"],
        ["blocked", "seed", "blocked"],
        ["blocked", "blocked", "blocked"],
      ],
    },
    {
      step: "Step 5：回退为 0",
      stackCount: 0,
      activeStackIndex: 0,
      focus: ["1,1"],
      grid: [
        ["blocked", "empty", "other"],
        ["blocked", "rejected", "blocked"],
        ["blocked", "blocked", "blocked"],
      ],
    },
  ];

  const fillSteps = [
    {
      step: "Step 1：开始遍历",
      stackCount: 1,
      activeStackIndex: 0,
      focus: ["1,1"],
      grid: [
        ["empty", "empty", "low"],
        ["empty", "seed", "empty"],
        ["blocked", "empty", "blocked"],
      ],
    },
    {
      step: "Step 2：八邻居连通且无归属",
      stackCount: 1,
      activeStackIndex: 1,
      focus: ["0,1", "1,0", "1,2", "2,1", "0,0"],
      grid: [
        ["empty", "empty", "low"],
        ["empty", "seed", "empty"],
        ["blocked", "empty", "blocked"],
      ],
    },
    {
      step: "Step 3：四邻居入栈，本体出栈",
      stackCount: 4,
      activeStackIndex: 0,
      focus: [],
      grid: [
        ["empty", "new", "low"],
        ["new", "seed", "new"],
        ["blocked", "new", "blocked"],
      ],
    },
    {
      step: "Step 4：下一轮迭代",
      stackCount: 4,
      activeStackIndex: 1,
      focus: ["1,0"],
      grid: [
        ["empty", "seed", "low"],
        ["seed", "seed", "seed"],
        ["blocked", "seed", "blocked"],
      ],
    },
  ];

  function renderStack(count, activeIndex) {
    const boxes = [];
    for (let i = 0; i < count; i += 1) {
      boxes.push(`<span class="flood-demo-stack-box${i === activeIndex ? " is-active" : ""}"></span>`);
    }
    return `
      <div class="flood-demo-stack">
        ${boxes.join("")}
      </div>
    `;
  }

  function renderGrid(grid, focusKeys) {
    const focus = new Set(focusKeys || []);
    return grid.flatMap((row) => row).map((kind, index) => {
      const x = index % 3;
      const y = Math.floor(index / 3);
      const label = kind === "other" ? "3" : kind === "seed" || kind === "new" ? "r" : kind === "rejected" ? "0" : "";
      const focusClass = focus.has(`${x},${y}`) ? " is-focus" : "";
      return `<div class="flood-demo-cell is-${kind}${focusClass}">${label}</div>`;
    }).join("");
  }

  function renderCard(host, title, state) {
    if (!host) {
      return;
    }

    const stepText = state.step || "";
    const stepMatch = stepText.match(/^(Step\s*\d+\s*[：:])(.*)$/);
    const stepPrefix = stepMatch ? stepMatch[1] : stepText;
    const stepSuffix = stepMatch ? stepMatch[2].trim() : "";

    host.innerHTML = `
      <section class="flood-demo-card">
        <div class="flood-demo-content">
          <div class="flood-demo-title">${title}</div>
          <div class="flood-demo-stack-label">stack</div>
          <div class="flood-demo-left">
            <div class="flood-demo-step">
              <span class="flood-demo-step-prefix">${stepPrefix}</span>
              <span class="flood-demo-step-text">${stepSuffix}</span>
            </div>
            <div class="flood-demo-grid">${renderGrid(state.grid, state.focus)}</div>
          </div>
          ${renderStack(state.stackCount, state.activeStackIndex)}
        </div>
      </section>
    `;
  }

  let conflictIndex = 0;
  let fillIndex = 0;

  function renderConflict() {
    renderCard(conflictHost, "邻居有归属，回退等待", conflictSteps[conflictIndex]);
  }

  function renderFill() {
    renderCard(fillHost, "邻居无归属，四向扩散", fillSteps[fillIndex]);
  }

  renderConflict();
  renderFill();

  window.setInterval(() => {
    conflictIndex = (conflictIndex + 1) % conflictSteps.length;
    renderConflict();
  }, 1500);

  window.setInterval(() => {
    fillIndex = (fillIndex + 1) % fillSteps.length;
    renderFill();
  }, 1600);
})();

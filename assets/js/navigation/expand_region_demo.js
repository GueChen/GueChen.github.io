(function () {
  const host = document.getElementById("expand_region_demo");
  if (!host) {
    return;
  }

  const styleId = "expand-region-demo-style";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .expand-demo-card {
        max-width: 620px;
        margin: 0 auto;
        padding: 14px;
        border-radius: 14px;
        background: #f8fafc;
        border: 1px solid rgba(148, 163, 184, 0.28);
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
        color: #1f2937;
        overflow: hidden;
      }
      .expand-demo-content {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 52px;
        grid-template-rows: auto auto;
        column-gap: 14px;
        row-gap: 8px;
        align-items: start;
      }
      .expand-demo-title {
        margin: 0;
        text-align: center;
        font-size: 15px;
        font-weight: 700;
        color: #0f172a;
      }
      .expand-demo-stack-label {
        font-size: 12px;
        font-weight: 700;
        color: #0f172a;
        text-align: center;
        grid-column: 2;
        grid-row: 1;
        align-self: center;
      }
      .expand-demo-left {
        grid-column: 1;
        grid-row: 2;
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        gap: 8px;
      }
      .expand-demo-step {
        width: 100%;
        display: flex;
        gap: 6px;
        align-items: flex-start;
        font-size: 12px;
        line-height: 1.45;
        min-height: calc(2 * 1.45em);
        color: #0369a1;
        font-weight: 700;
      }
      .expand-demo-step-prefix {
        flex: 0 0 auto;
        white-space: nowrap;
      }
      .expand-demo-step-text {
        flex: 1 1 auto;
        min-width: 0;
        text-align: left;
      }
      .expand-demo-stack {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        margin: 0;
        width: 48px;
        grid-column: 2;
        grid-row: 2;
      }
      .expand-demo-stack-box {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #fdba74;
        border: 1px solid rgba(194, 65, 12, 0.35);
        color: #7c2d12;
        font: 700 12px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      .expand-demo-stack-box.is-pending {
        background: #fdba74;
      }
      .expand-demo-stack-box.is-active {
        background: #f97316;
        color: #fff7ed;
        box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.18);
      }
      .expand-demo-stack-box.is-used {
        background: #94a3b8;
        border-color: rgba(71, 85, 105, 0.4);
        color: #f8fafc;
      }
      .expand-demo-grid {
        display: grid;
        gap: 5px;
        justify-content: center;
        padding: 8px;
        margin: 0;
      }
      .expand-demo-cell {
        width: 42px;
        height: 42px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        box-sizing: border-box;
        color: #f8fafc;
        font: 700 11px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        transition: transform 0.22s ease, box-shadow 0.22s ease, background-color 0.22s ease;
      }
      .expand-demo-cell::after {
        content: attr(data-note);
        position: absolute;
        right: 4px;
        bottom: 3px;
        font-size: 9px;
        line-height: 1;
        color: rgba(248, 250, 252, 0.9);
      }
      .expand-demo-cell.is-focus {
        transform: scale(1.05);
        box-shadow: 0 0 0 3px rgba(255, 50, 87, 0.25);
      }
      .expand-demo-cell.is-empty { background: #1d4f91; }
      .expand-demo-cell.is-blocked { background: #4b5563; color: #cbd5e1; }
      .expand-demo-cell.is-low { background: #64748b; }
      .expand-demo-cell.is-region-a { background: #2f9e44; }
      .expand-demo-cell.is-region-b { background: #7c3aed; }
      .expand-demo-cell.is-candidate { background: #d97706; }
      .expand-demo-cell.is-assigned { background: #dc2626; }
      .expand-demo-note {
        margin: 10px 0 0;
        text-align: left;
        font-size: 12px;
        line-height: 1.45;
        min-height: calc(2 * 1.45em);
        color: #475569;
      }
      .expand-demo-steps-nav {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 7px;
        margin-top: 8px;
        padding: 1px 0 4px;
        min-height: 12px;
        overflow: visible;
      }
      .expand-demo-step-arc {
        width: 6px;
        height: 6px;
        padding: 0;
        border: 0;
        border-radius: 999px;
        background: #9ca3af;
        cursor: pointer;
        appearance: none;
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        opacity: 0.9;
        flex: 0 0 auto;
        transition: transform 0.2s ease, margin 0.2s ease, width 0.2s ease, height 0.2s ease, background-color 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;
      }
      .expand-demo-step-arc:hover {
        background: #4b5563;
        opacity: 1;
      }
      .expand-demo-step-arc.is-active {
        width: 12px;
        height: 12px;
        margin: 0 1px;
        border: 2px solid #111827;
        border-radius: 999px;
        background: transparent;
        opacity: 1;
        transform: none;
      }
      .expand-demo-step-arc.is-paused {
        width: 12px;
        height: 12px;
      }
      .expand-demo-step-play {
        width: 0;
        height: 0;
        margin-left: 1px;
        border-top: 3px solid transparent;
        border-bottom: 3px solid transparent;
        border-left: 4px solid #111827;
      }
      .expand-demo-step-arc:focus-visible {
        outline: 2px solid rgba(253, 98, 87, 0.75);
        outline-offset: 3px;
      }
    `;
    document.head.appendChild(style);
  }

  function cloneGrid(grid) {
    return grid.map((row) => row.map((cell) => ({ ...cell })));
  }

  function withCells(baseGrid, overrides) {
    const grid = cloneGrid(baseGrid);
    overrides.forEach(({ x, y, patch }) => {
      Object.assign(grid[y][x], patch);
    });
    return grid;
  }

  const baseGrid = [
    [
      { type: "blocked", label: "" },
      { type: "blocked", label: "" },
      { type: "blocked", label: "" },
      { type: "blocked", label: "" },
      { type: "blocked", label: "" },
      { type: "blocked", label: "" },
    ],
    [
      { type: "blocked", label: "" },
      { type: "empty", label: "" },
      { type: "region-b", label: "4", note: "6" },
      { type: "empty", label: "" },
      { type: "blocked", label: "" },
      { type: "blocked", label: "" },
    ],
    [
      { type: "region-a", label: "2", note: "2" },
      { type: "region-a", label: "2", note: "2" },
      { type: "candidate", label: "A", note: "0" },
      { type: "candidate", label: "B", note: "0" },
      { type: "candidate", label: "C", note: "0" },
      { type: "blocked", label: "" },
    ],
    [
      { type: "empty", label: "" },
      { type: "region-a", label: "2", note: "2" },
      { type: "low", label: "", note: "low" },
      { type: "blocked", label: "" },
      { type: "empty", label: "" },
      { type: "blocked", label: "" },
    ],
    [
      { type: "blocked", label: "" },
      { type: "empty", label: "" },
      { type: "empty", label: "" },
      { type: "blocked", label: "" },
      { type: "blocked", label: "" },
      { type: "blocked", label: "" },
    ],
    [
      { type: "blocked", label: "" },
      { type: "blocked", label: "" },
      { type: "blocked", label: "" },
      { type: "blocked", label: "" },
      { type: "blocked", label: "" },
      { type: "blocked", label: "" },
    ],
  ];

  const gridAfterA = withCells(baseGrid, [
    { x: 2, y: 2, patch: { type: "assigned", label: "2", note: "4" } },
  ]);

  const gridAfterAB = withCells(gridAfterA, [
    { x: 3, y: 2, patch: { type: "assigned", label: "2", note: "6" } },
  ]);

  const gridAfterABC = withCells(gridAfterAB, [
    { x: 4, y: 2, patch: { type: "assigned", label: "2", note: "8" } },
  ]);

  const steps = [
    {
      step: "Step 1：",
      text: "进入 expandRegions，栈为空",
      stack: [],
      focus: [],
      note: "此时 A / B / C 满足条件，未入栈",
      grid: cloneGrid(baseGrid),
    },
    {
      step: "Step 2：",
      text: "扫描高度场，把 dist ≥ level 且 region = 0 的元素入 stack",
      stack: [
        { label: "A", state: "active" },
        { label: "B", state: "pending" },
        { label: "C", state: "pending" },
      ],
      focus: ["2,2", "3,2", "4,2"],
      note: "这里橙色的 A、B、C 同时满足条件，入栈",
      grid: cloneGrid(baseGrid),
    },
    {
      step: "Step 3：",
      text: "处理 A：四邻居中左侧与上侧可扩散；右侧 B 无归属，下侧非法块",
      stack: [
        { label: "A", state: "active" },
        { label: "B", state: "pending" },
        { label: "C", state: "pending" },
      ],
      focus: ["1,2", "2,1", "2,2", "3,2", "2,3"],
      note: "可选邻居中，左侧区域为 2，上侧区域为 4，但左侧距离为 2 小于上侧距离 4，归属左侧 2 区域",
      grid: cloneGrid(baseGrid),
    },
    {
      step: "Step 4：",
      text: "比较两个可用邻居的 srcDist + 2：左侧给 4，上侧给 8，因此 A 暂定写入 dstReg = 2，dstDist = 4。",
      stack: [
        { label: "A", state: "active" },
        { label: "B", state: "pending" },
        { label: "C", state: "pending" },
      ],
      focus: ["1,2", "2,1", "2,2"],
      note: "expandRegions 不是随便挑一个邻居，而是保留 srcDist + 2 更小的那个，等价于优先并入距离场上更近的已有 region。",
      grid: cloneGrid(gridAfterA),
    },
    {
      step: "Step 5：",
      text: "同一轮继续处理 B，但它左边的 A 此时只写进了 dstReg；在这一轮里 srcReg[A] 仍是 0，所以 B 会先 failed，继续留在 stack 中。",
      stack: [
        { label: "A", state: "used" },
        { label: "B", state: "active" },
        { label: "C", state: "pending" },
      ],
      focus: ["2,2", "3,2"],
      note: "这正是源码里 while 循环要先整轮写 dst、再统一 rcSwap(srcReg, dstReg) 的原因：同一轮新增的归属不会立刻连锁扩张。",
      grid: cloneGrid(gridAfterA),
    },
    {
      step: "Step 6：",
      text: "整轮结束后交换 src / dst，进入下一轮。现在 B 重新检查左邻居 A，终于能看到 srcReg = 2、srcDist = 4，因此得到 d2 = 6。",
      stack: [
        { label: "A", state: "used" },
        { label: "B", state: "active" },
        { label: "C", state: "pending" },
      ],
      focus: ["2,2", "3,2"],
      note: "B 的其它方向仍然无效：上方是空，右边 C 还没归属，下方是 blocked，所以它只能沿着刚扩出来的 A 继续向外生长。",
      grid: cloneGrid(gridAfterA),
    },
    {
      step: "Step 7：",
      text: "B 被写入 dstReg = 2，dstDist = 6；但 C 这时还只能看到 srcReg[B] = 0，所以它也会像前面的 B 一样，先在本轮 failed 一次。",
      stack: [
        { label: "A", state: "used" },
        { label: "B", state: "used" },
        { label: "C", state: "active" },
      ],
      focus: ["3,2", "4,2"],
      note: "你可以把它理解成一圈一圈向外推进：每一轮只能使用“上一轮已经稳定”的 region 结果，不能在同一轮里无限连锁传播。",
      grid: cloneGrid(gridAfterAB),
    },
    {
      step: "Step 8：",
      text: "再次交换 src / dst 后，C 终于能从左邻居 B 继承 region=2，得到 dstDist = 8，最后一个候选也被补齐。",
      stack: [
        { label: "A", state: "used" },
        { label: "B", state: "used" },
        { label: "C", state: "active" },
      ],
      focus: ["3,2", "4,2"],
      note: "这一轮 C 的有效来源只有 B，因此不会再发生竞争；它直接沿着前两轮铺开的路径继续扩张。",
      grid: cloneGrid(gridAfterABC),
    },
    {
      step: "Step 9：",
      text: "A、B、C 全部消费完成后，stack 里的条目都被标记为 used，这一轮 expandRegions 结束，整条走廊都归入 region=2。",
      stack: [
        { label: "A", state: "used" },
        { label: "B", state: "used" },
        { label: "C", state: "used" },
      ],
      focus: ["2,2", "3,2", "4,2"],
      note: "结合源码里的 failed 计数来看：当剩下的候选要么都成功写入、要么整轮都无法再推进时，while 就会停止，等待更低 level 的下一次扩张。",
      grid: cloneGrid(gridAfterABC),
    },
  ];

  function renderStack(items) {
    const boxes = (items || []).map((item) =>
      `<span class="expand-demo-stack-box is-${item.state || "pending"}">${item.label || ""}</span>`
    );
    return `<div class="expand-demo-stack">${boxes.join("")}</div>`;
  }

  function renderGrid(grid, focusKeys) {
    const focus = new Set(focusKeys || []);
    const width = grid[0] ? grid[0].length : 0;
    return grid.flatMap((row) => row).map((cell, index) => {
      const x = width ? index % width : 0;
      const y = width ? Math.floor(index / width) : 0;
      const focusClass = focus.has(`${x},${y}`) ? " is-focus" : "";
      return `<div class="expand-demo-cell is-${cell.type}${focusClass}" data-note="${cell.note || ""}">${cell.label || ""}</div>`;
    }).join("");
  }

  function renderStepArcs() {
    return `
      <div class="expand-demo-steps-nav" aria-label="Expand regions steps">
        ${steps.map((step, index) => `
          <button
            type="button"
            class="expand-demo-step-arc${index === currentStep ? " is-active" : ""}${index === currentStep && isPaused ? " is-paused" : ""}"
            data-step-index="${index}"
            aria-label="${index === currentStep && isPaused ? `Resume autoplay from ${step.step}` : step.step}"
            aria-pressed="${index === currentStep ? "true" : "false"}"
            title="${step.step}"
          >${index === currentStep && isPaused ? '<span class="expand-demo-step-play" aria-hidden="true"></span>' : ""}</button>
        `).join("")}
      </div>
    `;
  }

  function render() {
    const state = steps[currentStep];
    const stepText = state.step || "";
    const stepMatch = stepText.match(/^(Step\s*\d+\s*[：:])(.*)$/);
    const stepPrefix = stepMatch ? stepMatch[1] : stepText;
    const stepSuffix = stepMatch ? stepMatch[2].trim() : "";

    host.innerHTML = `
      <section class="expand-demo-card">
        <div class="expand-demo-content">
          <div class="expand-demo-title">从已有区域补归属</div>
          <div class="expand-demo-stack-label">stack</div>
          <div class="expand-demo-left">
            <div class="expand-demo-step">
              <span class="expand-demo-step-prefix">${stepPrefix}</span>
              <span class="expand-demo-step-text">${stepSuffix || state.text}</span>
            </div>
            <div class="expand-demo-grid" style="grid-template-columns: repeat(${state.grid[0].length}, 42px);">${renderGrid(state.grid, state.focus)}</div>
          </div>
          ${renderStack(state.stack)}
        </div>
        <p class="expand-demo-note">${state.note}</p>
        ${renderStepArcs()}
      </section>
    `;
  }

  const AUTO_PLAY_INTERVAL = 2600;
  let currentStep = 0;
  let isPaused = false;
  let autoPlayTimer = null;

  function stopAutoPlay() {
    if (autoPlayTimer !== null) {
      window.clearInterval(autoPlayTimer);
      autoPlayTimer = null;
    }
  }

  function startAutoPlay() {
    stopAutoPlay();
    isPaused = false;
    autoPlayTimer = window.setInterval(() => {
      currentStep = (currentStep + 1) % steps.length;
      render();
    }, AUTO_PLAY_INTERVAL);
  }

  function pauseAutoPlay() {
    stopAutoPlay();
    isPaused = true;
  }

  host.addEventListener("click", (event) => {
    const target = event.target.closest("[data-step-index]");
    if (!target) {
      return;
    }

    const nextStep = Number(target.dataset.stepIndex);
    if (Number.isNaN(nextStep) || nextStep < 0 || nextStep >= steps.length) {
      return;
    }

    if (nextStep === currentStep && isPaused) {
      startAutoPlay();
      render();
      return;
    }

    currentStep = nextStep;
    pauseAutoPlay();
    render();
  });
  render();
  startAutoPlay();
})();

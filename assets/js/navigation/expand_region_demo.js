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
        max-width: 430px;
        margin: 0 auto;
        padding: 14px;
        border-radius: 14px;
        background: #f8fafc;
        border: 1px solid rgba(148, 163, 184, 0.28);
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
        color: #1f2937;
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
        align-items: baseline;
        font-size: 12px;
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
        text-align: center;
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
        width: 24px;
        height: 24px;
        border-radius: 6px;
        background: #fb923c;
        border: 1px solid rgba(194, 65, 12, 0.35);
      }
      .expand-demo-stack-box.is-active {
        background: #f97316;
        box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.18);
      }
      .expand-demo-grid {
        display: grid;
        grid-template-columns: repeat(3, 42px);
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
        box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.28);
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
        text-align: center;
        font-size: 12px;
        line-height: 1.45;
        color: #475569;
      }
    `;
    document.head.appendChild(style);
  }

  const steps = [
    {
      step: "Step 1：",
      text: "先把 dist >= level 且 srcReg == 0 的候选体素收进 stack。",
      stackCount: 1,
      activeStackIndex: 0,
      focus: ["1,1"],
      note: "中心橙色格是本轮 expandRegions 待补归属的候选。",
      grid: [
        [{ type: "blocked", label: "" }, { type: "region-b", label: "4", note: "6" }, { type: "blocked", label: "" }],
        [{ type: "region-a", label: "2", note: "2" }, { type: "candidate", label: "?", note: "0" }, { type: "blocked", label: "" }],
        [{ type: "blocked", label: "" }, { type: "low", label: "", note: "low" }, { type: "blocked", label: "" }],
      ],
    },
    {
      step: "Step 2：",
      text: "只检查四邻居；左边 region=2 可用，且 srcDist+2 = 4。",
      stackCount: 1,
      activeStackIndex: 0,
      focus: ["0,1", "1,1"],
      note: "这里只有左邻居满足 area 一致且已有 region 归属。",
      grid: [
        [{ type: "blocked", label: "" }, { type: "region-b", label: "4", note: "6" }, { type: "blocked", label: "" }],
        [{ type: "region-a", label: "2", note: "2" }, { type: "candidate", label: "?", note: "0" }, { type: "blocked", label: "" }],
        [{ type: "blocked", label: "" }, { type: "low", label: "", note: "low" }, { type: "blocked", label: "" }],
      ],
    },
    {
      step: "Step 3：",
      text: "上邻居 region=4 也可用，但 srcDist+2 = 8，因此不会被选中。",
      stackCount: 1,
      activeStackIndex: 0,
      focus: ["1,0", "1,1"],
      note: "expandRegions 在多个可选区域里，会保留 srcDist+2 更小的那个。",
      grid: [
        [{ type: "blocked", label: "" }, { type: "region-b", label: "4", note: "6" }, { type: "blocked", label: "" }],
        [{ type: "region-a", label: "2", note: "2" }, { type: "candidate", label: "?", note: "0" }, { type: "blocked", label: "" }],
        [{ type: "blocked", label: "" }, { type: "low", label: "", note: "low" }, { type: "blocked", label: "" }],
      ],
    },
    {
      step: "Step 4：",
      text: "因此当前体素被写入 dstReg = 2，dstDist = 4，并标记为已使用。",
      stackCount: 0,
      activeStackIndex: -1,
      focus: ["1,1"],
      note: "源码里对应 dstReg[i] = r，dstDist[i] = d2，并把 stack[j+2] 记为 -1。",
      grid: [
        [{ type: "blocked", label: "" }, { type: "region-b", label: "4", note: "6" }, { type: "blocked", label: "" }],
        [{ type: "region-a", label: "2", note: "2" }, { type: "assigned", label: "2", note: "4" }, { type: "blocked", label: "" }],
        [{ type: "blocked", label: "" }, { type: "low", label: "", note: "low" }, { type: "blocked", label: "" }],
      ],
    },
  ];

  function renderStack(count, activeIndex) {
    const boxes = [];
    for (let i = 0; i < count; i += 1) {
      boxes.push(`<span class="expand-demo-stack-box${i === activeIndex ? " is-active" : ""}"></span>`);
    }
    return `<div class="expand-demo-stack">${boxes.join("")}</div>`;
  }

  function renderGrid(grid, focusKeys) {
    const focus = new Set(focusKeys || []);
    return grid.flatMap((row) => row).map((cell, index) => {
      const x = index % 3;
      const y = Math.floor(index / 3);
      const focusClass = focus.has(`${x},${y}`) ? " is-focus" : "";
      return `<div class="expand-demo-cell is-${cell.type}${focusClass}" data-note="${cell.note || ""}">${cell.label || ""}</div>`;
    }).join("");
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
            <div class="expand-demo-grid">${renderGrid(state.grid, state.focus)}</div>
          </div>
          ${renderStack(state.stackCount, state.activeStackIndex)}
        </div>
        <p class="expand-demo-note">${state.note}</p>
      </section>
    `;
  }

  let currentStep = 0;
  render();
  window.setInterval(() => {
    currentStep = (currentStep + 1) % steps.length;
    render();
  }, 1600);
})();

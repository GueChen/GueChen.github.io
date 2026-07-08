(function () {
  const host = document.getElementById("walk_contour_demo");
  if (!host) {
    return;
  }

  const styleId = "walk-contour-demo-style";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .walk-demo-card {
        max-width: 560px;
        margin: 0 auto;
        padding: 14px;
        border-radius: 14px;
        background: #f8fafc;
        border: 1px solid rgba(148, 163, 184, 0.28);
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
        color: #1f2937;
      }
      .walk-demo-title {
        margin: 0;
        text-align: center;
        font-size: 15px;
        font-weight: 700;
        color: #0f172a;
      }
      .walk-demo-body {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 180px;
        gap: 14px;
        align-items: start;
        margin-top: 10px;
      }
      .walk-demo-grid-wrap {
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: center;
      }
      .walk-demo-grid {
        display: grid;
        grid-template-columns: repeat(5, 42px);
        grid-template-rows: repeat(5, 42px);
        gap: 4px;
        justify-content: center;
        padding: 8px 0;
      }
      .walk-demo-cell {
        position: relative;
        width: 42px;
        height: 42px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        font: 700 11px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        color: #111827;
        box-shadow: inset 0 0 0 1px #cbd5e1;
      }
      .walk-demo-cell.is-empty { background: #e5e7eb; color: #475569; }
      .walk-demo-cell.is-a { background: #93c5fd; }
      .walk-demo-cell.is-b { background: #86efac; }
      .walk-demo-cell.is-c { background: #c4b5fd; }
      .walk-demo-cell.is-d { background: #fde68a; }
      .walk-demo-cell.is-e { background: #f9a8d4; }
      .walk-demo-cell.is-focus {
        box-shadow: inset 0 0 0 1px #93c5fd, 0 0 0 2px rgba(59, 130, 246, 0.16);
        transform: scale(1.04);
        font-size: 22px;
        font-weight: 900;
      }
      .walk-demo-side {
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 12px;
        line-height: 1.5;
      }
      .walk-demo-side code {
        padding: 2px 6px;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.08);
        color: #0f172a;
      }
      .walk-demo-chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .walk-demo-chip {
        width: 18px;
        height: 18px;
        border-radius: 5px;
        box-shadow: inset 0 0 0 1px #cbd5e1;
        flex: 0 0 auto;
      }
      .walk-demo-chip.is-empty { background: #e5e7eb; }
      .walk-demo-chip.is-a { background: #93c5fd; }
      .walk-demo-chip.is-b { background: #86efac; }
      .walk-demo-chip.is-c { background: #c4b5fd; }
      .walk-demo-chip.is-d { background: #fde68a; }
      .walk-demo-chip.is-e { background: #f9a8d4; }
      @media screen and (max-width: 680px) {
        .walk-demo-body {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  const grid = [
    ["∅", "B", "B", "C", "∅"],
    ["E", "A", "A", "A", "C"],
    ["E", "A", "A", "A", "D"],
    ["∅", "A", "A", "A", "D"],
    ["∅", "∅", "∅", "∅", "∅"],
  ];

  const states = [
    {
      x: 1,
      y: 1,
      dir: "↑",
      operation: "初始化 collector",
      rule: "不同区域：原地不动，顺时针旋转",
      collector: ["B"],
    },
    {
      x: 1,
      y: 1,
      dir: "→",
      operation: "顺时针转向",
      rule: "不同区域：原地不动，顺时针旋转",
      collector: ["B"],
    },
    {
      x: 2,
      y: 1,
      dir: "↑",
      operation: "向前移动 + 逆时针转向",
      rule: "相同区域：向前移动，逆时针旋转",
      collector: ["B"],
    },
    {
      x: 3,
      y: 1,
      dir: "↑",
      operation: "继续沿上边界移动",
      rule: "相同区域：向前移动，逆时针旋转",
      collector: ["B"],
    },
    {
      x: 3,
      y: 1,
      dir: "→",
      operation: "邻区切换为 C，记录后顺时针转向",
      rule: "不同区域：原地不动，顺时针旋转",
      collector: ["B", "C"],
    },
    {
      x: 3,
      y: 1,
      dir: "↓",
      operation: "继续顺时针贴边",
      rule: "不同区域：原地不动，顺时针旋转",
      collector: ["B", "C"],
    },
    {
      x: 3,
      y: 2,
      dir: "→",
      operation: "向前移动 + 逆时针转向",
      rule: "相同区域：向前移动，逆时针旋转",
      collector: ["B", "C"],
    },
    {
      x: 3,
      y: 2,
      dir: "↓",
      operation: "邻区切换为 D，记录后顺时针转向",
      rule: "不同区域：原地不动，顺时针旋转",
      collector: ["B", "C", "D"],
    },
    {
      x: 3,
      y: 3,
      dir: "→",
      operation: "向前移动 + 逆时针转向",
      rule: "相同区域：向前移动，逆时针旋转",
      collector: ["B", "C", "D"],
    },
    {
      x: 3,
      y: 3,
      dir: "↓",
      operation: "继续顺时针贴边",
      rule: "不同区域：原地不动，顺时针旋转",
      collector: ["B", "C", "D"],
    },
    {
      x: 3,
      y: 3,
      dir: "←",
      operation: "邻区切换为空区，记录后顺时针转向",
      rule: "不同区域：原地不动，顺时针旋转",
      collector: ["B", "C", "D", "0"],
    },
    {
      x: 2,
      y: 3,
      dir: "↓",
      operation: "向前移动 + 逆时针转向",
      rule: "相同区域：向前移动，逆时针旋转",
      collector: ["B", "C", "D", "0"],
    },
    {
      x: 1,
      y: 3,
      dir: "↓",
      operation: "继续沿下边界移动",
      rule: "相同区域：向前移动，逆时针旋转",
      collector: ["B", "C", "D", "0"],
    },
    {
      x: 1,
      y: 3,
      dir: "←",
      operation: "继续顺时针贴边",
      rule: "不同区域：原地不动，顺时针旋转",
      collector: ["B", "C", "D", "0"],
    },
    {
      x: 1,
      y: 3,
      dir: "↑",
      operation: "邻区切换为 E，记录后顺时针转向",
      rule: "不同区域：原地不动，顺时针旋转",
      collector: ["B", "C", "D", "0", "E"],
    },
    {
      x: 1,
      y: 2,
      dir: "←",
      operation: "向前移动 + 逆时针转向",
      rule: "相同区域：向前移动，逆时针旋转",
      collector: ["B", "C", "D", "0", "E"],
    },
    {
      x: 1,
      y: 1,
      dir: "←",
      operation: "继续沿左边界移动",
      rule: "相同区域：向前移动，逆时针旋转",
      collector: ["B", "C", "D", "0", "E"],
    },
    {
      x: 1,
      y: 1,
      dir: "↑",
      operation: "顺时针转回起始方向",
      rule: "不同区域：原地不动，顺时针旋转",
      collector: ["B", "C", "D", "0", "E"],
    },
    {
      x: 1,
      y: 1,
      dir: "↑",
      operation: "结束，最后去重不改动 collector",
      rule: "停止条件：回到 starti + startDir",
      collector: ["B", "C", "D", "0", "E"],
    },
  ];

  function cellType(value) {
    if (value === "A") return "is-a";
    if (value === "B") return "is-b";
    if (value === "C") return "is-c";
    if (value === "D") return "is-d";
    if (value === "E") return "is-e";
    return "is-empty";
  }

  function collectorType(value) {
    if (value === "A") return "is-a";
    if (value === "B") return "is-b";
    if (value === "C") return "is-c";
    if (value === "D") return "is-d";
    if (value === "E") return "is-e";
    return "is-empty";
  }

  function renderGrid(state) {
    return grid.flatMap((row, y) => row.map((value, x) => {
      const focus = x === state.x && y === state.y ? " is-focus" : "";
      const label = x === state.x && y === state.y ? state.dir : "";
      return `<div class="walk-demo-cell ${cellType(value)}${focus}">${label}</div>`;
    })).join("");
  }

  function render(index) {
    const state = states[index];
    host.innerHTML = `
      <section class="walk-demo-card">
        <div class="walk-demo-title">walkContour：沿区域边界收集所有相邻区域</div>
        <div class="walk-demo-body">
          <div class="walk-demo-grid-wrap">
            <div class="walk-demo-grid">${renderGrid(state)}</div>
          </div>
          <div class="walk-demo-side">
            <div><code>Current Operation</code></div>
            <div>${state.operation}</div>
            <div><code>Current Rule</code></div>
            <div>${state.rule}</div>
            <div><code>contour collector</code></div>
            <div class="walk-demo-chip-row">
              ${state.collector.map((item) => `<span class="walk-demo-chip ${collectorType(item)}"></span>`).join("")}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  let current = 0;
  render(current);
  window.setInterval(() => {
    current = (current + 1) % states.length;
    render(current);
  }, 1900);
})();

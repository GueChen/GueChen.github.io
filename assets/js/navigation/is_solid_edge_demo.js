(function () {
  const host = document.getElementById("is_solid_edge_demo");
  if (!host) {
    return;
  }

  const styleId = "is-solid-edge-demo-style";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .edge-demo-card {
        max-width: 520px;
        margin: 0 auto;
        padding: 14px;
        border-radius: 14px;
        background: #f8fafc;
        border: 1px solid rgba(148, 163, 184, 0.28);
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
        color: #1f2937;
      }
      .edge-demo-title {
        margin: 0 0 10px;
        text-align: center;
        font-size: 15px;
        font-weight: 700;
        color: #0f172a;
      }
      .edge-demo-step {
        margin: 0 0 10px;
        text-align: center;
        font-size: 12px;
        line-height: 1.5;
        color: #0369a1;
        font-weight: 700;
      }
      .edge-demo-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 160px;
        gap: 14px;
        align-items: center;
      }
      .edge-demo-grid {
        display: grid;
        grid-template-columns: repeat(3, 46px);
        grid-template-rows: repeat(3, 46px);
        gap: 4px;
        justify-content: center;
        padding: 8px 0;
      }
      .edge-demo-cell {
        position: relative;
        width: 46px;
        height: 46px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font: 700 11px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        color: #111827;
        box-sizing: border-box;
        box-shadow: inset 0 0 0 1px #cbd5e1;
        transition: transform 0.18s ease, box-shadow 0.18s ease;
      }
      .edge-demo-cell.is-empty { background: #e5e7eb; color: #475569; }
      .edge-demo-cell.is-a { background: #93c5fd; }
      .edge-demo-cell.is-b { background: #86efac; }
      .edge-demo-cell.is-focus {
        box-shadow: inset 0 0 0 1px #93c5fd, 0 0 0 2px rgba(59, 130, 246, 0.16);
        transform: scale(1.04);
        font-size: 22px;
        font-weight: 900;
      }
      .edge-demo-side {
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 12px;
        line-height: 1.5;
      }
      .edge-demo-side-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .edge-demo-side code {
        padding: 2px 6px;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.08);
        color: #0f172a;
      }
      .edge-demo-swatch {
        width: 18px;
        height: 18px;
        border-radius: 5px;
        box-shadow: inset 0 0 0 1px #cbd5e1;
        flex: 0 0 auto;
      }
      .edge-demo-swatch.is-empty { background: #e5e7eb; }
      .edge-demo-swatch.is-a { background: #93c5fd; }
      .edge-demo-swatch.is-b { background: #86efac; }
      .edge-demo-result {
        padding: 10px 12px;
        border-radius: 10px;
        font-weight: 700;
        text-align: center;
      }
      .edge-demo-result.is-false {
        background: rgba(34, 197, 94, 0.14);
        color: #166534;
      }
      .edge-demo-result.is-true {
        background: rgba(239, 68, 68, 0.14);
        color: #991b1b;
      }
      .edge-demo-note {
        margin: 10px 0 0;
        text-align: center;
        font-size: 12px;
        line-height: 1.5;
        color: #475569;
      }
      @media screen and (max-width: 620px) {
        .edge-demo-layout {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  const states = [
    {
      step: "Case 1：探测方向仍在同一区域内",
      current: "A",
      neighbour: "A",
      connected: true,
      result: false,
      note: "此时 r == srcReg[i]，因此不是 solid edge。",
    },
    {
      step: "Case 2：探测方向连到了其他区域",
      current: "A",
      neighbour: "B",
      connected: true,
      result: true,
      note: "此时 r != srcReg[i]，因此该方向是区域边界。",
    },
    {
      step: "Case 3：该方向没有连通邻居",
      current: "A",
      neighbour: "∅",
      connected: false,
      result: true,
      note: "实现上未连通时 r 会保持 0，也同样被视为 solid edge。",
    },
  ];

  function renderGrid(state) {
    const currentType = "is-a";
    const neighbourType = state.neighbour === "A" ? "is-a" : state.neighbour === "B" ? "is-b" : "is-empty";
    const cells = [];
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        let label = "";
        let type = "is-empty";
        let focus = "";
        if (x === 1 && y === 1) {
          label = "→";
          type = currentType;
          focus = " is-focus";
        } else if (x === 2 && y === 1) {
          type = neighbourType;
        }
        cells.push(`<div class="edge-demo-cell ${type}${focus}">${label}</div>`);
      }
    }
    return cells.join("");
  }

  function render(index) {
    const state = states[index];
    const neighbourType = state.neighbour === "A" ? "is-a" : state.neighbour === "B" ? "is-b" : "is-empty";
    host.innerHTML = `
      <section class="edge-demo-card">
        <div class="edge-demo-title">isSolidEdge：当前方向是否已经走到区域边界</div>
        <div class="edge-demo-step">${state.step}</div>
        <div class="edge-demo-layout">
          <div class="edge-demo-grid">${renderGrid(state)}</div>
          <div class="edge-demo-side">
            <div class="edge-demo-side-row"><code>srcReg[i]</code> = <span class="edge-demo-swatch is-a"></span></div>
            <div class="edge-demo-side-row"><code>r</code> = <span class="edge-demo-swatch ${neighbourType}"></span></div>
            <div><code>connected</code> = ${state.connected ? "true" : "false"}</div>
            <div class="edge-demo-result ${state.result ? "is-true" : "is-false"}">
              isSolidEdge = ${state.result}
            </div>
          </div>
        </div>
        <p class="edge-demo-note">${state.note}</p>
      </section>
    `;
  }

  let current = 0;
  render(current);
  window.setInterval(() => {
    current = (current + 1) % states.length;
    render(current);
  }, 1800);
})();

function applyStyles(element, styles) {
  Object.entries(styles).forEach(([key, value]) => {
    element.style[key] = value;
  });
}

export function createDemoShell(container, options) {
  const {
    layoutId,
    viewportId,
    panelId,
    title,
    headerRight = "",
    viewportHeight = 320,
    maxWidth = "760px",
    panelBodyHtml,
    viewportOverlayHtml = "",
  } = options;

  container.classList.remove("three-container");
  applyStyles(container, {
    position: "relative",
    display: "block",
    width: "100%",
    maxWidth,
    height: "auto",
    minHeight: `${viewportHeight}px`,
    padding: "12px",
    background: "rgba(15, 23, 42, 0.03)",
    textAlign: "left",
    boxSizing: "border-box",
    overflow: "hidden",
    border: "3px solid #121212",
    borderRadius: "2%",
    margin: "20px auto",
  });

  container.innerHTML = `
    <div id="${layoutId}" style="display:flex; flex-wrap:wrap; gap:12px; align-items:stretch; width:100%;">
      <div id="${viewportId}" style="position:relative; flex:2 1 360px; min-width:0; max-width:100%; height:${viewportHeight}px;">
        ${viewportOverlayHtml}
      </div>
      <div
        id="${panelId}"
        style="
          flex:1 1 240px;
          min-width:0;
          max-width:100%;
          box-sizing:border-box;
          padding:12px 14px;
          border-radius:12px;
          background:rgba(15,23,42,0.78);
          color:#f8fafc;
          font-size:12px;
          line-height:1.6;
          box-shadow:0 8px 20px rgba(0,0,0,0.16);
          text-align:left;
          overflow-wrap:anywhere;
        "
      >
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px;">
          <strong style="font-size:12px;">${title}</strong>
          <span style="color:#cbd5e1;">${headerRight}</span>
        </div>
        ${panelBodyHtml}
      </div>
    </div>
  `;

  return {
    layout: document.getElementById(layoutId),
    viewport: document.getElementById(viewportId),
    panel: document.getElementById(panelId),
  };
}

export function applyResponsiveSplitLayout(container, layout, viewport, panel, options = {}) {
  const {
    breakpoint = 700,
    wideViewportFlex = "2 1 0%",
    widePanelFlex = "0 0 260px",
    widePanelWidth = "260px",
    stackedViewportFlex = "1 1 360px",
    stackedPanelFlex = "1 1 240px",
  } = options;

  const shouldStack = container.clientWidth < breakpoint;
  layout.style.flexWrap = shouldStack ? "wrap" : "nowrap";
  viewport.style.flex = shouldStack ? stackedViewportFlex : wideViewportFlex;
  panel.style.flex = shouldStack ? stackedPanelFlex : widePanelFlex;
  panel.style.width = shouldStack ? "auto" : widePanelWidth;
}

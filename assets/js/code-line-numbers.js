(function () {
  function applyLineNumbers() {
    document.querySelectorAll(".highlight pre").forEach((pre) => {
      if (pre.dataset.lineNumbersApplied === "true") {
        return;
      }

      const code = pre.querySelector("code");
      if (!code) {
        return;
      }

      const html = (code.innerHTML || "").replace(/\r\n/g, "\n");
      const normalizedHtml = html.endsWith("\n") ? html.slice(0, -1) : html;
      const lines = normalizedHtml.length ? normalizedHtml.split("\n") : [""];
      const lineCount = lines.length;

      const gutter = document.createElement("span");
      gutter.className = "code-line-gutter";
      gutter.setAttribute("aria-hidden", "true");

      const fragment = document.createDocumentFragment();
      for (let i = 1; i <= lineCount; i += 1) {
        const line = document.createElement("span");
        line.className = "code-line-gutter-number";
        line.textContent = String(i);
        if (i % 2 === 0) {
          line.classList.add("is-even");
        }
        fragment.appendChild(line);
      }
      gutter.appendChild(fragment);

      const codeFragment = document.createDocumentFragment();
      lines.forEach((content, index) => {
        const line = document.createElement("span");
        line.className = "code-line-content";
        if ((index + 1) % 2 === 0) {
          line.classList.add("is-even");
        }
        line.innerHTML = content.length ? content : "&nbsp;";
        codeFragment.appendChild(line);
      });

      code.innerHTML = "";
      code.appendChild(codeFragment);
      pre.insertBefore(gutter, code);
      pre.dataset.lineNumbersApplied = "true";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyLineNumbers);
  } else {
    applyLineNumbers();
  }
})();

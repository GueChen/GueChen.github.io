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

      const text = code.textContent || "";
      const normalized = text.endsWith("\n") ? text.slice(0, -1) : text;
      const lineCount = normalized.length ? normalized.split("\n").length : 1;

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

      const contentLines = normalized.length ? normalized.split("\n") : [""];
      const codeFragment = document.createDocumentFragment();
      contentLines.forEach((content, index) => {
        const line = document.createElement("span");
        line.className = "code-line-content";
        if ((index + 1) % 2 === 0) {
          line.classList.add("is-even");
        }
        line.textContent = content.length ? content : "\u00A0";
        codeFragment.appendChild(line);
      });

      code.textContent = "";
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

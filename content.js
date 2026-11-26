const titlePattern = /title|item name/i;
const sizePatterns = {
  us: /\b(?:us|usa|u\.s\.)\s*(?:shoe\s*)?size\b|\bshoe\s*size\s*(?:us|usa|u\.s\.)\b/i,
  uk: /\b(?:uk|u\.k\.)\s*(?:shoe\s*)?size\b|\bshoe\s*size\s*(?:uk|u\.k\.)\b/i,
  eu: /\b(?:eu|eur|european)\s*(?:shoe\s*)?size\b|\bshoe\s*size\s*(?:eu|eur|european)\b/i
};

function labelText(element) {
  const id = element.id;
  const linked = id ? [...document.querySelectorAll(`label[for="${CSS.escape(id)}"]`)].map(node => node.innerText) : [];
  const wrapping = element.closest("label")?.innerText || "";
  const labelledBy = (element.getAttribute("aria-labelledby") || "").split(/\s+/)
    .map(ref => document.getElementById(ref)?.innerText || "").join(" ");
  const aria = element.getAttribute("aria-label") || "";
  const meta = `${element.getAttribute("name") || ""} ${id} ${element.getAttribute("data-testid") || ""}`;
  // Limit nearby text to the nearest field wrapper to avoid matching another size field.
  const wrapper = element.closest("[role='group'], fieldset, .field, .form-group") || element.parentElement;
  const nearby = wrapper?.innerText || "";
  return `${linked.join(" ")} ${wrapping} ${labelledBy} ${aria} ${meta} ${nearby}`.slice(0, 800);
}

function fireValueEvents(control) {
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

function setNativeControl(control, value) {
  if (control instanceof HTMLSelectElement) {
    const options = [...control.options];
    const match = options.find(option => option.value.trim() === value || option.text.trim() === value)
      || options.find(option => new RegExp(`(?:^|\\D)${value}(?:\\D|$)`).test(option.text));
    if (!match) return false;
    control.value = match.value;
  } else if (control instanceof HTMLInputElement && ["text", "", "search"].includes(control.type)) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter ? setter.call(control, value) : (control.value = value);
  } else return false;
  fireValueEvents(control);
  return true;
}

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
}

function setCustomControl(control, value) {
  const tag = control.getAttribute("role");
  if (!(tag === "combobox" || tag === "listbox" || control.hasAttribute("aria-haspopup"))) return false;
  control.click();
  control.focus();

  const findOption = () => [...document.querySelectorAll('[role="option"], [role="menuitem"], li')]
    .find(option => isVisible(option) && option.innerText.trim() === value);
  const option = findOption();
  if (option) {
    option.click();
    return true;
  }

  // Some custom selects open a popup but expose options only after a frame/update.
  const active = document.activeElement;
  if (active?.getAttribute("role") === "combobox" || active?.getAttribute("aria-haspopup")) {
    active.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true }));
    active.dispatchEvent(new KeyboardEvent("keyup", { key: value, bubbles: true }));
    active.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    active.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
    return true;
  }
  return false;
}

async function updateField(fieldKey, value) {
  const fieldName = { us: "US Shoe Size", uk: "UK Shoe Size", eu: "EU Shoe Size" }[fieldKey];
  const exactName = `attributes.${fieldName}`;

  // Re-query right before acting because eBay may replace these controls.
  const button = [...document.querySelectorAll('button[name]')]
    .find(item => item.getAttribute("name") === exactName && isVisible(item));
  if (button) {
    if (button.textContent.trim() === String(value)) return true;
    const menuId = button.getAttribute("aria-controls") || button.getAttribute("aria-owns");
    button.click();

    // Never search all menus for a bare number: US/EU lists share options.
    // Only click an option if eBay links the popup to this exact trigger.
    const menu = await waitFor(() => {
      const linked = menuId ? document.getElementById(menuId) : null;
      return linked && isVisible(linked) ? linked : null;
    }, 2500);
    if (!menu) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return false;
    }
    const option = [...menu.querySelectorAll('button, [role="option"], [role="menuitem"]')]
      .find(item => isVisible(item) && item.textContent.trim() === String(value));
    if (!option) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return false;
    }
    option.click();
    const updated = await waitFor(() => {
      const updatedButton = [...document.querySelectorAll('button[name]')]
        .find(item => item.getAttribute("name") === exactName && isVisible(item));
      return updatedButton?.textContent.trim() === String(value);
    }, 2500);
    return Boolean(updated);
  }

  const pattern = sizePatterns[fieldKey];
  const candidates = [...document.querySelectorAll(
    'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, [role="combobox"], [role="listbox"], [aria-haspopup]'
  )].filter(isVisible);
  const control = candidates.find(item => pattern.test(labelText(item)));
  if (!control) return false;
  if (setNativeControl(control, value)) return true;
  return setCustomControl(control, value);
}

function waitFor(check, timeoutMs = 5000) {
  return new Promise(resolve => {
    const started = Date.now();
    const poll = () => {
      let result = null;
      try { result = check(); } catch { /* eBay may be re-rendering the node. */ }
      if (result) return resolve(result);
      if (Date.now() - started >= timeoutMs) return resolve(null);
      setTimeout(poll, 100);
    };
    poll();
  });
}

function showProgressOverlay(message, detail = "") {
  let overlay = document.getElementById("olahub-progress-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "olahub-progress-overlay";
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    overlay.innerHTML = `
      <div class="olahub-progress-card">
        <div class="olahub-progress-spinner" aria-hidden="true"></div>
        <div class="olahub-progress-copy"><strong></strong><span></span></div>
      </div>`;
    const style = document.createElement("style");
    style.id = "olahub-progress-style";
    style.textContent = `
      #olahub-progress-overlay { position:fixed; inset:0; z-index:2147483647; display:grid; place-items:center; background:rgba(12,16,29,.38); font:14px Arial,sans-serif; }
      #olahub-progress-overlay .olahub-progress-card { display:flex; align-items:center; gap:14px; min-width:280px; max-width:420px; padding:20px 22px; border:1px solid #3d4c67; border-radius:12px; background:#191a2d; color:#f4f6fc; box-shadow:0 14px 48px #0007; }
      #olahub-progress-overlay .olahub-progress-copy { display:flex; flex-direction:column; gap:5px; }
      #olahub-progress-overlay strong { font-size:14px; }
      #olahub-progress-overlay span { color:#a9bad4; font-size:12px; }
      #olahub-progress-overlay .olahub-progress-spinner { width:22px; height:22px; flex:0 0 22px; border:3px solid #40506a; border-top-color:#09c9f0; border-radius:50%; animation:olahub-spin .8s linear infinite; }
      @keyframes olahub-spin { to { transform:rotate(360deg); } }
      #olahub-progress-overlay[data-done="true"] .olahub-progress-spinner { display:none; }
    `;
    document.documentElement.append(style, overlay);
  }
  overlay.dataset.done = "false";
  overlay.querySelector("strong").textContent = message;
  overlay.querySelector("span").textContent = detail;
  return overlay;
}

function finishProgressOverlay(message, detail, success) {
  const overlay = document.getElementById("olahub-progress-overlay");
  if (!overlay) return;
  overlay.dataset.done = "true";
  overlay.querySelector("strong").textContent = message;
  overlay.querySelector("span").textContent = detail;
  overlay.style.background = "rgba(12,16,29,.24)";
  setTimeout(() => {
    overlay.remove();
    document.getElementById("olahub-progress-style")?.remove();
  }, success ? 1200 : 2200);
}

function isSellSimilarListing() {
  const url = new URL(location.href);
  return url.pathname === "/lstng" && url.searchParams.get("mode") === "SellSimilarItem";
}

function mountListingAssistant() {
  if (!isSellSimilarListing() || document.getElementById("olahub-listing-assistant")) return;
  const host = document.createElement("div");
  host.id = "olahub-listing-assistant";
  host.style.cssText = "position:fixed;top:90px;right:18px;z-index:2147483000;width:340px;max-height:calc(100vh - 110px);overflow:auto;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      *{box-sizing:border-box} .panel{padding:17px;background:#191a2d;color:#f4f6fc;border:1px solid #3c4560;border-radius:10px;box-shadow:0 10px 32px #0005;font:13px Arial,sans-serif}
      header{text-align:center;margin-bottom:17px}h1{font-size:18px;margin:0 0 4px}header p{font-size:11px;color:#8ea9d1;margin:0}
      h2,.ref-title{margin:0 0 7px;color:#91a9ce;text-transform:uppercase;letter-spacing:.5px;font-size:10px;font-weight:500}
      .sizes{display:grid;grid-template-columns:repeat(8,1fr);gap:5px}.size{height:34px;border:1px solid #41445e;border-radius:6px;background:#202237;color:#d9e4f6;font-weight:bold;cursor:pointer}.size.selected{border:2px solid #00c9f3;color:#00ddff;box-shadow:0 0 10px #00c9f355}
      .reference{margin:13px 0;padding:9px;border:1px solid #3b4560;border-radius:6px;background:#1c263a;color:#9eb2d1;font-size:12px}.ref-title{margin-bottom:5px}.reference div:not(.ref-title){display:flex;gap:12px;line-height:18px}.reference b{font-weight:400;color:#d5deeb}
      .fields{margin:14px 0}.checks{display:grid;grid-template-columns:1fr 1fr;gap:9px 5px}.checks label{display:flex;align-items:center;gap:5px;white-space:nowrap}.checks input{margin:0;accent-color:#08c5ef}
      #apply{width:100%;height:37px;border:0;border-radius:6px;background:linear-gradient(105deg,#05c9ed,#3287d9);color:#fff;font-size:13px;font-weight:bold;cursor:pointer}#apply:disabled{opacity:.65;cursor:wait}
      #status{min-height:14px;margin:7px 1px 0;color:#a9c5e8;font-size:11px}
    </style>
    <main class="panel"><header><h1>OlaHub</h1><p>Listing Assistant</p></header>
      <section><h2>Select size</h2><div class="sizes" id="sizes"></div></section>
      <aside class="reference"><div class="ref-title">Size reference (for info only)</div><div><span>US</span><b id="ref-us">—</b></div><div><span>UK</span><b id="ref-uk">—</b></div><div><span>EU</span><b id="ref-eu">—</b></div></aside>
      <section class="fields"><h2>Fields to update</h2><div class="checks"><label><input type="checkbox" name="title" checked> Title</label><label><input type="checkbox" name="us" checked> US Shoe Size</label><label><input type="checkbox" name="uk" checked> UK Shoe Size</label><label><input type="checkbox" name="eu" checked> EU Shoe Size</label></div></section>
      <button id="apply" disabled>Apply Changes</button><p id="status" role="status" aria-live="polite">Detecting current US shoe size…</p>
    </main>`;
  document.documentElement.append(host);

  const sizes = [
    { us: "4", uk: "3", eu: "36" }, { us: "5", uk: "4", eu: "37" },
    { us: "6", uk: "5", eu: "39" }, { us: "7", uk: "6", eu: "40" },
    { us: "8", uk: "7", eu: "41" }, { us: "9", uk: "8", eu: "42" },
    { us: "10", uk: "9", eu: "44" }, { us: "11", uk: "10", eu: "45" }
  ];
  let selected = null;
  let manuallySelected = false;
  const sizeGrid = shadow.querySelector("#sizes");
  const applyButton = shadow.querySelector("#apply");
  const choose = (item, manual = false) => {
    selected = item;
    if (manual) manuallySelected = true;
    applyButton.disabled = false;
    for (const button of sizeGrid.querySelectorAll("button")) {
      const active = button.dataset.us === item.us;
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
    }
    for (const key of ["us", "uk", "eu"]) shadow.querySelector(`#ref-${key}`).textContent = item[key];
  };
  for (const item of sizes) {
    const button = document.createElement("button");
    button.type = "button"; button.className = "size"; button.textContent = `M${item.us}`;
    button.dataset.us = item.us; button.addEventListener("click", () => choose(item, true)); sizeGrid.append(button);
  }
  const detection = waitFor(() => {
    const button = [...document.querySelectorAll('button[name="attributes.US Shoe Size"]')].find(isVisible);
    if (!button) return null;
    const match = button.textContent.trim().match(/\b(\d+(?:\.\d+)?)\b/);
    return match ? { button, us: match[1] } : null;
  }, 15000);
  shadow.querySelector("#apply").addEventListener("click", async event => {
    if (!selected) return;
    const applyButton = event.currentTarget;
    const fields = Object.fromEntries([...shadow.querySelectorAll(".checks input")].map(input => [input.name, input.checked]));
    const status = shadow.querySelector("#status");
    applyButton.disabled = true;
    status.textContent = "Applying changes…";
    showProgressOverlay("Updating listing…", "Preparing selected fields");
    try {
      const result = await applyListingChanges(selected, fields, detail => {
        status.textContent = detail;
        showProgressOverlay("Updating listing…", detail);
      });
      status.textContent = result.message;
      finishProgressOverlay(result.ok ? "Listing fields updated" : "Couldn’t update listing fields", result.message, result.ok);
    } catch (error) {
      status.textContent = error.message || "Update failed";
      finishProgressOverlay("Update failed", error.message || "An unexpected error occurred.", false);
    } finally {
      applyButton.disabled = false;
    }
  });
  detection.then(detected => {
    if (manuallySelected) return;
    if (!detected) {
      shadow.querySelector("#status").textContent = "Could not detect the current size. Choose a size to continue.";
      return;
    }
    const match = sizes.find(item => item.us === detected.us);
    if (match) {
      choose(match);
      shadow.querySelector("#status").textContent = `Detected current US size ${match.us} (M${match.us})`;
    } else {
      shadow.querySelector("#status").textContent = `Detected US size ${detected.us}; choose a supported size M4–M11`;
    }
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountListingAssistant, { once: true });
else mountListingAssistant();

async function applyListingChanges(size, fields, onProgress = () => {}) {
  const changed = [];
  const missing = [];
  const selectedFields = [["us", "US Shoe Size", size.us], ["uk", "UK Shoe Size", size.uk], ["eu", "EU Shoe Size", size.eu]]
    .filter(([key]) => fields[key]);
  let titleChanged = false;
  if (fields.title) {
    const title = [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea")]
      .find(control => titlePattern.test(labelText(control)));
    if (title && title instanceof HTMLInputElement) {
      const previous = title.value;
      const updated = previous.replace(/\bM\s*\d+(?:\.\d+)?\b/gi, `M${size.us}`).replace(/\b(?:US\s*)\d+(?:\.\d+)?\b/gi, `US ${size.us}`);
      if (updated !== previous) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter ? setter.call(title, updated) : (title.value = updated);
        fireValueEvents(title); changed.push("title"); titleChanged = true;
      } else missing.push("title (no existing size marker)");
    } else missing.push("title");
  }
  if (titleChanged && selectedFields.length) {
    for (let remaining = 6; remaining > 0; remaining--) {
      onProgress(`eBay refreshing the listing… ${remaining}s`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  for (const [key, label, value] of selectedFields) {
    onProgress(`Setting ${label} to ${value}…`);
    if (await updateField(key, value)) changed.push(label);
    else missing.push(label);
  }
  return { ok: changed.length > 0, message: changed.length
    ? `Updated ${changed.join(", ")}.${missing.length ? ` Not found: ${missing.join(", ")}.` : ""}`
    : `No fields updated. Not found: ${missing.join(", ") || "matching size fields"}.` };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "APPLY_SIZE") return;
  applyListingChanges(message.size, message.fields, detail => showProgressOverlay("Updating listing…", detail))
    .then(result => {
      finishProgressOverlay(result.ok ? "Listing fields updated" : "Couldn’t update listing fields", result.message, result.ok);
      sendResponse({ ...result, error: result.ok ? undefined : result.message });
    })
    .catch(error => {
      finishProgressOverlay("Update failed", error.message || "An unexpected error occurred.", false);
      sendResponse({ ok: false, error: error.message || "An unexpected error occurred." });
    });
  return true;
});


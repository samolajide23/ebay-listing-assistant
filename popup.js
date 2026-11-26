const sizes = [
  { us: "4", uk: "3", eu: "36" }, { us: "5", uk: "4", eu: "37" },
  { us: "6", uk: "5", eu: "39" }, { us: "7", uk: "6", eu: "40" },
  { us: "8", uk: "7", eu: "41" }, { us: "9", uk: "8", eu: "42" },
  { us: "10", uk: "9", eu: "44" }, { us: "11", uk: "10", eu: "45" }
];
const sizeGrid = document.querySelector("#sizes");
const status = document.querySelector("#status");
let selected = sizes[7];

function choose(size) {
  selected = size;
  for (const button of sizeGrid.querySelectorAll("button")) {
    const active = button.dataset.us === size.us;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-pressed", String(active));
  }
  document.querySelector("#ref-us").textContent = size.us;
  document.querySelector("#ref-uk").textContent = size.uk;
  document.querySelector("#ref-eu").textContent = size.eu;
}

for (const size of sizes) {
  const button = document.createElement("button");
  button.className = "size";
  button.type = "button";
  button.textContent = `M${size.us}`;
  button.dataset.us = size.us;
  button.setAttribute("aria-label", `Men's US size ${size.us}`);
  button.addEventListener("click", () => choose(size));
  sizeGrid.append(button);
}
choose(selected);

document.querySelector("#apply").addEventListener("click", async (event) => {
  const fields = Object.fromEntries([...document.querySelectorAll(".checks input")].map(input => [input.name, input.checked]));
  const button = event.currentTarget;
  button.disabled = true;
  status.textContent = "Applying to the current eBay tab…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https:\/\/(www\.)?ebay\.(com|co\.uk)\//.test(tab.url || "")) {
      throw new Error("Open an eBay listing page first.");
    }
    const response = await chrome.tabs.sendMessage(tab.id, { type: "APPLY_SIZE", size: selected, fields });
    if (!response?.ok) throw new Error(response?.error || "Could not find matching listing fields.");
    status.textContent = response.message;
  } catch (error) {
    status.textContent = error.message.includes("Receiving end")
      ? "Refresh the eBay listing page, then try again."
      : error.message;
  } finally {
    button.disabled = false;
  }
});

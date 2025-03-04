// activity.js

function updateActivity() {
  chrome.runtime.sendMessage({ action: "updateActivity" });
}

document.addEventListener("mousemove", updateActivity);
document.addEventListener("keydown", updateActivity);
document.addEventListener("scroll", updateActivity);
document.addEventListener("click", updateActivity);

// Listen for custom events dispatched by the overlay.
document.addEventListener("overlayGoToTab", (e) => {
  const tabId = e.detail.tabId;
  chrome.runtime.sendMessage({ action: "activateFrozenTab", tabId: tabId });
});

document.addEventListener("overlayDismiss", () => {
  console.log("Overlay dismissed by the user.");
});

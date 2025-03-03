// activity.js
function updateActivity() {
  chrome.runtime.sendMessage({ action: "updateActivity" });
}

document.addEventListener("mousemove", updateActivity);
document.addEventListener("keydown", updateActivity);
document.addEventListener("scroll", updateActivity);
document.addEventListener("click", updateActivity);

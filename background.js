// background.js

// Object to keep track of each tab's last active time and freeze info.
// Structure: { [tabId]: { lastActive: number, frozenAt?: number, notified?: boolean } }
let tabActivity = {};

// Helper: Returns true if the URL is a chrome:// page or belongs to our extension.
function shouldSkipInjection(url) {
  if (!url) return true;
  return url.startsWith("chrome://") || url.includes(chrome.runtime.id);
}

// Helper: Update a tab's activity timestamp and clear any freeze data.
function updateTabActivity(tabId) {
  if (!tabActivity[tabId]) {
    tabActivity[tabId] = {};
  }
  tabActivity[tabId].lastActive = Date.now();
  tabActivity[tabId].frozenAt = null;
  tabActivity[tabId].notified = false;
}

// Listen for messages from content scripts to update activity.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "updateActivity" && sender.tab && sender.tab.id) {
    updateTabActivity(sender.tab.id);
  }
  // Handle request to activate a frozen tab.
  if (msg.action === "activateFrozenTab" && msg.tabId) {
    chrome.tabs.update(msg.tabId, { active: true }, () => {
      updateTabActivity(msg.tabId);
    });
  }
});

// Update activity on tab activation, update, or creation.
chrome.tabs.onActivated.addListener(activeInfo => {
  updateTabActivity(activeInfo.tabId);
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // When the tab's discarded status changes, update frozenAt.
  if (typeof changeInfo.discarded !== "undefined") {
    if (changeInfo.discarded === true) {
      if (!tabActivity[tabId]) tabActivity[tabId] = {};
      tabActivity[tabId].frozenAt = Date.now();
      tabActivity[tabId].notified = false;
    } else {
      if (tabActivity[tabId]) {
        tabActivity[tabId].frozenAt = null;
        tabActivity[tabId].notified = false;
      }
    }
  }
  if (changeInfo.status === 'complete') {
    updateTabActivity(tabId);
    smartGroupTab(tab);
  }
});
chrome.tabs.onCreated.addListener(tab => {
  updateTabActivity(tab.id);
  smartGroupTab(tab);
});

// Utility: Extract the domain from a URL.
function getDomain(url) {
  try {
    return (new URL(url)).hostname;
  } catch (e) {
    return null;
  }
}

// Utility: Classify a tab based on keywords in its URL or title.
function classifyTab(tab) {
  if (!tab.url) return null;
  const url = tab.url.toLowerCase();
  const title = (tab.title || "").toLowerCase();
  
  const categories = {
    "News": ["news", "article", "blog", "medium", "post", "press"],
    "Recipes": ["recipe", "cook", "food", "cuisine", "dish", "cooking"],
    "Videos": ["video", "youtube", "vimeo", "dailymotion"],
    "Shopping": ["shop", "store", "sale", "product", "amazon", "ebay", "mall"],
    "Social": ["facebook", "twitter", "instagram", "reddit", "social", "tiktok"],
    "Academic": ["scholar", "research", "academic", "university", ".edu"],
    "Entertainment": ["netflix", "hulu", "imdb", "movie", "tv", "streaming"]
  };
  
  for (let category in categories) {
    const keywords = categories[category];
    for (let keyword of keywords) {
      if (url.includes(keyword) || title.includes(keyword)) {
        return category;
      }
    }
  }
  return null;
}

// Smart Grouping: Group tabs based on selected grouping mode.
function smartGroupTab(tab) {
  if (!tab.url || !tab.id) return;
  chrome.storage.sync.get(
    { extensionEnabled: true, autoGroupingEnabled: true, groupingMode: "smart" },
    (data) => {
      if (!data.extensionEnabled || !data.autoGroupingEnabled) return;
      
      if (data.groupingMode === "smart") {
        const category = classifyTab(tab);
        if (category) {
          chrome.tabs.query({ currentWindow: true }, (tabs) => {
            let matchingTabIds = [];
            tabs.forEach(t => {
              if (t.url && classifyTab(t) === category) {
                matchingTabIds.push(t.id);
              }
            });
            if (matchingTabIds.length > 0) {
              chrome.tabs.group({ tabIds: matchingTabIds }, (groupId) => {
                if (chrome.tabGroups && chrome.tabGroups.update) {
                  chrome.tabGroups.update(groupId, { title: category }, () => {
                    console.log(`Grouped tabs as ${category}`);
                  });
                } else {
                  console.log(`Grouped tabs as ${category}`);
                }
              });
            }
          });
        } else {
          groupByDomain(tab);
        }
      } else {
        groupByDomain(tab);
      }
    }
  );
}

// Helper: Group tabs by their domain.
function groupByDomain(tab) {
  const domain = getDomain(tab.url);
  if (!domain) return;
  chrome.tabs.query({ currentWindow: true }, (tabs) => {
    let matchingTabIds = [];
    tabs.forEach(t => {
      if (t.id !== tab.id && t.url && getDomain(t.url) === domain) {
        matchingTabIds.push(t.id);
      }
    });
    if (matchingTabIds.length > 0) {
      chrome.tabs.group({ tabIds: [tab.id, ...matchingTabIds] }, (groupId) => {
        console.log(`Grouped tabs by domain under groupId: ${groupId}`);
      });
    }
  });
}

// notifyFrozenTab: Inject an overlay notification into the currently active tab.
function notifyFrozenTab(frozenTab, frozenCloseThreshold, frozenCloseSeconds) {
  // Get the currently active tab in the current window.
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length) {
      let activeTab = tabs[0];
      // Inject a script into the active tab that creates an overlay popup.
      chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: (frozenTitle, frozenTabId) => {
          // Create an overlay div.
          let overlay = document.createElement("div");
          overlay.style.position = "fixed";
          overlay.style.bottom = "20px";
          overlay.style.right = "20px";
          overlay.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
          overlay.style.color = "white";
          overlay.style.padding = "10px";
          overlay.style.borderRadius = "5px";
          overlay.style.fontSize = "14px";
          overlay.style.zIndex = "10000";
          overlay.style.boxShadow = "0 2px 10px rgba(0,0,0,0.5)";
          overlay.innerHTML = `<div><strong>${frozenTitle}</strong> is frozen and will close soon.</div>
                               <div style="margin-top:5px;">
                                 <button id="goToFrozenTabButton" style="margin-right:5px;">Go to Tab</button>
                                 <button id="dismissFrozenPopupButton">Dismiss</button>
                               </div>`;
          document.body.appendChild(overlay);
          // Attach event listeners.
          document.getElementById("goToFrozenTabButton").addEventListener("click", () => {
            chrome.runtime.sendMessage({ action: "activateFrozenTab", tabId: frozenTabId });
            overlay.remove();
          });
          document.getElementById("dismissFrozenPopupButton").addEventListener("click", () => {
            overlay.remove();
          });
          // Automatically fade out the overlay after 5 seconds.
          setTimeout(() => {
            overlay.style.transition = "opacity 1s";
            overlay.style.opacity = "0";
            setTimeout(() => { overlay.remove(); }, 1000);
          }, 5000);
        },
        args: [frozenTab.title, frozenTab.id]
      }).catch(err => console.error("executeScript error in notifyFrozenTab:", err));
    }
  });
}

// Auto-Close and Page Freezer Feature:
// Check every second for frozen tabs and close them if they have been frozen too long.
// Also, if Page Freezer is enabled, discard (freeze) eligible tabs.
setInterval(() => {
  chrome.storage.sync.get(
    {
      extensionEnabled: true,
      pageFreezerEnabled: true,
      freezeAfterSeconds: 5,       // Inactivity threshold (seconds) before discarding a tab.
      frozenCloseSeconds: 300      // If a tab remains frozen longer than this, close it.
    },
    (data) => {
      if (!data.extensionEnabled) return;
      const freezeThreshold = data.freezeAfterSeconds * 1000;
      const frozenCloseThreshold = data.frozenCloseSeconds * 1000;
      const now = Date.now();
      
      // Page Freezer: If enabled, discard (freeze) any eligible tab.
      if (data.pageFreezerEnabled) {
        chrome.tabs.query({ currentWindow: true }, (tabs) => {
          tabs.forEach(tab => {
            if (!tab.active && !tab.pinned && !tab.discarded && tab.url && !shouldSkipInjection(tab.url)) {
              // Skip if the tab is still loading or playing audio.
              if (tab.status !== "complete" || tab.audible) return;
              let activity = tabActivity[tab.id];
              if (!activity) return;
              const inactiveTime = Date.now() - activity.lastActive;
              if (inactiveTime >= freezeThreshold) {
                chrome.tabs.discard(tab.id, (discardedTab) => {
                  if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError.message);
                  } else {
                    if (!tabActivity[tab.id]) tabActivity[tab.id] = {};
                    tabActivity[tab.id].frozenAt = Date.now();
                    tabActivity[tab.id].notified = false;
                    console.log(`Tab ${tab.id} discarded (frozen) after ${data.freezeAfterSeconds} seconds.`);
                  }
                });
              }
            }
          });
        });
      }
      
      // Frozen Tabs Close: For each frozen tab, if it has been frozen longer than frozenCloseThreshold, notify then close.
      chrome.tabs.query({ currentWindow: true, discarded: true }, (tabs) => {
        tabs.forEach(tab => {
          if (!tab.active && tab.url && !shouldSkipInjection(tab.url)) {
            let activity = tabActivity[tab.id];
            if (!activity || !activity.frozenAt) return;
            const frozenTime = Date.now() - activity.frozenAt;
            // If within 5 seconds of the threshold and not yet notified, show a popup notification.
            if (frozenTime >= (frozenCloseThreshold - 5000) && !activity.notified) {
              notifyFrozenTab(tab, frozenCloseThreshold, data.frozenCloseSeconds);
              activity.notified = true;
            }
            // If frozen longer than the threshold, close the tab.
            if (frozenTime >= frozenCloseThreshold) {
              chrome.tabs.remove(tab.id, () => {
                console.log(`Frozen tab ${tab.id} closed after ${data.frozenCloseSeconds} seconds.`);
                delete tabActivity[tab.id];
              });
            }
          }
        });
      });
    }
  );
}, 1000); // Check every second.

// Message listener for session, bookmarking, restoration, etc.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getGroupBookmarks") {
    chrome.storage.local.get({ bookmarkedGroups: [] }, (result) => {
      sendResponse({ groups: result.bookmarkedGroups || [] });
    });
    return true;
  }
  // ... add other message handlers as needed ...
});

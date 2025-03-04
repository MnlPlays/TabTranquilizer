// background.js

// Object to keep track of each tab's last active time and freeze info.
// Structure: { [tabId]: { lastActive: number, frozenAt?: number, notified?: boolean, ignoreAutoFreezeUntil?: number } }
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
  // Remove the ignore flag when the user interacts with the tab.
  delete tabActivity[tabId].ignoreAutoFreezeUntil;
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
      // Check if the active tab is a restricted URL.
      if (
        activeTab.url &&
        (activeTab.url.startsWith("chrome-extension://") || activeTab.url.startsWith("chrome://"))
      ) {
        console.log("Skipping injection on restricted URL:", activeTab.url);
        return;
      }
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
          // Dispatch custom events on button click.
          document.getElementById("goToFrozenTabButton").addEventListener("click", () => {
            document.dispatchEvent(new CustomEvent("overlayGoToTab", { detail: { tabId: frozenTabId } }));
            overlay.remove();
          });
          document.getElementById("dismissFrozenPopupButton").addEventListener("click", () => {
            document.dispatchEvent(new CustomEvent("overlayDismiss"));
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

      // Page Freezer: If enabled, discard (freeze) any eligible tab.
      chrome.tabs.query({ currentWindow: true }, (tabs) => {
        tabs.forEach(tab => {
          if (!tab.active && !tab.pinned && !tab.discarded && tab.url && !shouldSkipInjection(tab.url)) {
            if (tab.status !== "complete" || tab.audible) return;
            let activity = tabActivity[tab.id];
            if (!activity) return;
            // Skip auto-freezing if within the grace period.
            if (activity.ignoreAutoFreezeUntil && Date.now() < activity.ignoreAutoFreezeUntil) return;
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

      // Frozen Tabs Close: For each frozen tab, if it has been frozen longer than frozenCloseThreshold, notify then close.
      chrome.tabs.query({ currentWindow: true, discarded: true }, (tabs) => {
        tabs.forEach(tab => {
          if (!tab.active && tab.url && !shouldSkipInjection(tab.url)) {
            let activity = tabActivity[tab.id];
            if (!activity || !activity.frozenAt) return;
            // Skip closing if within the grace period.
            if (activity.ignoreAutoFreezeUntil && Date.now() < activity.ignoreAutoFreezeUntil) return;
            const frozenTime = Date.now() - activity.frozenAt;
            if (frozenTime >= (frozenCloseThreshold - 5000) && !activity.notified) {
              notifyFrozenTab(tab, frozenCloseThreshold, data.frozenCloseSeconds);
              activity.notified = true;
            }
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

// --- New Simplified Bookmarking and Session Management Handlers ---
// These handlers are isolated from your other features.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Save Session: Store current window's tabs in local storage.
  if (message.action === "saveSession") {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const session = tabs.map(tab => ({ url: tab.url, title: tab.title }));
      chrome.storage.local.set({ savedSession: session }, () => {
        sendResponse({ status: "Session saved." });
      });
    });
    return true;
  }

  // Restore Session: Retrieve saved session and open each tab.
  if (message.action === "restoreSession") {
    chrome.storage.local.get({ savedSession: [] }, (result) => {
      const session = result.savedSession;
      if (session && session.length > 0) {
        session.forEach(tabInfo => {
          chrome.tabs.create({ url: tabInfo.url });
        });
        sendResponse({ status: "Session restored." });
      } else {
        sendResponse({ status: "No session saved." });
      }
    });
    return true;
  }

  // Bookmark Group: Save only the current tab group.
  if (message.action === "bookmarkGroup") {
    const groupName = message.groupName;
    if (!groupName) {
      sendResponse({ status: "Error: Group name is required." });
      return;
    }
    // Query the active tab.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab.groupId && activeTab.groupId !== -1) {
        // If the active tab is part of a group, query all tabs in that group.
        chrome.tabs.query({ groupId: activeTab.groupId, currentWindow: true }, (groupTabs) => {
          const group = {
            groupName: groupName,
            tabs: groupTabs.map(tab => ({ url: tab.url, title: tab.title })),
            persistent: true
          };
          chrome.storage.local.get({ bookmarkedGroups: [] }, (result) => {
            const groups = result.bookmarkedGroups;
            groups.push(group);
            chrome.storage.local.set({ bookmarkedGroups: groups }, () => {
              sendResponse({ status: "Group bookmarked successfully." });
            });
          });
        });
      } else {
        // Not in a group, so bookmark only the active tab.
        const group = {
          groupName: groupName,
          tabs: [{ url: activeTab.url, title: activeTab.title }],
          persistent: true
        };
        chrome.storage.local.get({ bookmarkedGroups: [] }, (result) => {
          const groups = result.bookmarkedGroups;
          groups.push(group);
          chrome.storage.local.set({ bookmarkedGroups: groups }, () => {
            sendResponse({ status: "Group bookmarked successfully." });
          });
        });
      }
    });
    return true;
  }

  // Get Group Bookmarks: Return all bookmarked groups.
  if (message.action === "getGroupBookmarks") {
    chrome.storage.local.get({ bookmarkedGroups: [] }, (result) => {
      sendResponse({ groups: result.bookmarkedGroups });
    });
    return true;
  }

  // Remove Group Bookmark: Delete a bookmarked group.
  if (message.action === "removeGroupBookmark") {
    const groupName = message.groupName;
    chrome.storage.local.get({ bookmarkedGroups: [] }, (result) => {
      const groups = result.bookmarkedGroups.filter(g => g.groupName !== groupName);
      chrome.storage.local.set({ bookmarkedGroups: groups }, () => {
        sendResponse({ status: "Group removed successfully." });
      });
    });
    return true;
  }

  // Restore Group: Open each tab saved in the bookmarked group.
  if (message.action === "restoreGroup") {
    const groupName = message.groupName;
    chrome.storage.local.get({ bookmarkedGroups: [] }, (result) => {
      const group = result.bookmarkedGroups.find(g => g.groupName === groupName);
      if (group) {
        group.tabs.forEach(tabInfo => {
          chrome.tabs.create({ url: tabInfo.url });
        });
        sendResponse({ status: "Group restored successfully." });
      } else {
        sendResponse({ status: "Group not found." });
      }
    });
    return true;
  }
});

// Cleanup: When a tab is closed, remove any bookmarked group (that is not persistent) whose tabs are no longer open.
function cleanupBookmarkedGroups() {
  chrome.tabs.query({ currentWindow: true }, (tabs) => {
    // Collect URLs of all open tabs.
    const openUrls = new Set(tabs.map(t => t.url));
    chrome.storage.local.get({ bookmarkedGroups: [] }, (result) => {
      let groups = result.bookmarkedGroups;
      // Only clean up groups that are not marked persistent.
      const filteredGroups = groups.filter(group => {
        if (group.persistent) {
          return true; // Keep persistent groups.
        }
        // Otherwise, keep the group only if at least one saved tab URL is still open.
        return group.tabs.some(tabInfo => openUrls.has(tabInfo.url));
      });
      if (filteredGroups.length !== groups.length) {
        chrome.storage.local.set({ bookmarkedGroups: filteredGroups }, () => {
          console.log("Cleaned up non-persistent bookmarked groups.");
        });
      }
    });
  });
}

// Run cleanup after a tab is removed.
chrome.tabs.onRemoved.addListener(() => {
  // Delay cleanup slightly to allow for multiple tabs closing.
  setTimeout(cleanupBookmarkedGroups, 1000);
});


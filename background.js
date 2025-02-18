// background.js

// Object to keep track of the last active time for each tab
let tabActivity = {};

// Update activity on tab activation
chrome.tabs.onActivated.addListener(activeInfo => {
  tabActivity[activeInfo.tabId] = Date.now();
});

// Update activity on tab update and trigger smart grouping
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    tabActivity[tabId] = Date.now();
    smartGroupTab(tab);
  }
});

// When a new tab is created, record its activity
chrome.tabs.onCreated.addListener(tab => {
  tabActivity[tab.id] = Date.now();
  smartGroupTab(tab);
});

// Utility: Extract the domain from a URL
function getDomain(url) {
  try {
    return (new URL(url)).hostname;
  } catch (e) {
    return null;
  }
}

// Smart Tab Grouping: Group tabs by their domain (this feature remains unchanged)
function smartGroupTab(tab) {
  if (!tab.url || !tab.id) return;
  const domain = getDomain(tab.url);
  if (!domain) return;
  
  chrome.tabs.query({}, (tabs) => {
    let matchingTabIds = [];
    tabs.forEach(t => {
      if (t.id !== tab.id && t.url && getDomain(t.url) === domain) {
        matchingTabIds.push(t.id);
      }
    });
    if (matchingTabIds.length > 0) {
      chrome.tabs.group({ tabIds: [tab.id, ...matchingTabIds] }, groupId => {
        console.log('Grouped tabs under groupId:', groupId);
      });
    }
  });
}

// Auto-Close Inactive Tabs: Check every minute if a tab should be closed
setInterval(() => {
  chrome.storage.sync.get({ autoCloseMinutes: 10 }, (data) => {
    const threshold = data.autoCloseMinutes * 60000; // Convert minutes to milliseconds
    const now = Date.now();
    for (let tabId in tabActivity) {
      if (now - tabActivity[tabId] > threshold) {
        chrome.tabs.get(parseInt(tabId), (tab) => {
          if (chrome.runtime.lastError || !tab) return;
          if (!tab.pinned) {
            chrome.tabs.remove(tab.id, () => {
              console.log(`Tab ${tab.id} closed due to inactivity.`);
              delete tabActivity[tab.id];
            });
          }
        });
      }
    }
  });
}, 60000);

// Message listener for session and group bookmarking actions
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Save session: store current window's tabs
  if (message.action === "saveSession") {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const sessionData = tabs.map(tab => ({ url: tab.url, pinned: tab.pinned }));
      chrome.storage.local.set({ savedSession: sessionData }, () => {
        sendResponse({ status: "Session saved", session: sessionData });
      });
    });
    return true;

  // Restore session: open tabs saved in the session
  } else if (message.action === "restoreSession") {
    chrome.storage.local.get("savedSession", (data) => {
      const sessionData = data.savedSession || [];
      sessionData.forEach(tabData => {
        chrome.tabs.create({ url: tabData.url, active: false });
      });
      sendResponse({ status: "Session restored", session: sessionData });
    });
    return true;

  // Bookmark a tab group – this version bookmarks all tabs in the current window under the given group name.
  } else if (message.action === "bookmarkGroup") {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      let groupTabs = tabs.map(tab => ({
        url: tab.url,
        title: tab.title,
        pinned: tab.pinned
      }));
      chrome.storage.local.get({ bookmarkedGroups: [] }, (result) => {
        let groups = result.bookmarkedGroups;
        // Remove any existing group with the same name to avoid duplicates
        groups = groups.filter(g => g.groupName !== message.groupName);
        groups.push({ groupName: message.groupName, tabs: groupTabs });
        chrome.storage.local.set({ bookmarkedGroups: groups }, () => {
          sendResponse({ status: "Group bookmarked", group: { groupName: message.groupName, tabs: groupTabs } });
        });
      });
    });
    return true;

  // Get list of bookmarked groups
  } else if (message.action === "getGroupBookmarks") {
    chrome.storage.local.get({ bookmarkedGroups: [] }, (result) => {
      sendResponse({ groups: result.bookmarkedGroups });
    });
    return true;

  // Remove a bookmarked group by its group name
  } else if (message.action === "removeGroupBookmark") {
    chrome.storage.local.get({ bookmarkedGroups: [] }, (result) => {
      const groups = result.bookmarkedGroups.filter(g => g.groupName !== message.groupName);
      chrome.storage.local.set({ bookmarkedGroups: groups }, () => {
        sendResponse({ status: "Group bookmark removed", groups });
      });
    });
    return true;

  // Restore a bookmarked group: open all tabs saved in that group,
  // but skip unwanted URLs (ChatGPT-related and extension pages).
  } else if (message.action === "restoreGroup") {
    chrome.storage.local.get({ bookmarkedGroups: [] }, (result) => {
      const group = result.bookmarkedGroups.find(g => g.groupName === message.groupName);
      if (group) {
        // Get the base URL for the extension (e.g. chrome-extension://<id>/)
        const extensionBaseURL = chrome.runtime.getURL("");
        group.tabs.forEach(tabData => {
          // Skip URLs that match any of the unwanted URLs.
          if (
            tabData.url &&
            !tabData.url.includes("chat.openai.com") &&
            !tabData.url.startsWith(extensionBaseURL) &&
            tabData.url !== "https://chatgpt.com/g/g-p-67ac180c603481919a7b2ab3963bc201-chrome-extension/c/67ac1944-cc68-8001-9fc1-65619808e905" &&
            tabData.url !== "chrome://extensions/"
          ) {
            chrome.tabs.create({ url: tabData.url, active: false });
          }
        });
        sendResponse({ status: "Group restored", group: group });
      } else {
        sendResponse({ status: "Group not found" });
      }
    });
    return true;
  }
});

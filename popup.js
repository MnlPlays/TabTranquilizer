document.addEventListener('DOMContentLoaded', () => {
  const saveSessionBtn = document.getElementById('saveSessionBtn');
  const restoreSessionBtn = document.getElementById('restoreSessionBtn');
  const bookmarkGroupBtn = document.getElementById('bookmarkGroupBtn');
  const bookmarkList = document.getElementById('bookmarkList');
  const groupNameInput = document.getElementById('groupNameInput');
  const optionsBtn = document.getElementById('optionsBtn');
  const statusDiv = document.getElementById('status');

  // Display status messages for a few seconds.
  function showStatus(message) {
    statusDiv.textContent = message;
    setTimeout(() => statusDiv.textContent = '', 3000);
  }

  function loadBookmarks() {
    chrome.runtime.sendMessage({ action: "getGroupBookmarks" }, (response) => {
      const groups = response.groups || [];
      bookmarkList.innerHTML = "";
      groups.forEach(group => {
        const li = document.createElement('li');
        li.textContent = group.groupName;
        li.style.cursor = "pointer";
        li.addEventListener('click', () => {
          chrome.runtime.sendMessage({ action: "restoreGroup", groupName: group.groupName }, (resp) => {
            showStatus(resp.status);
          });
        });
        const removeBtn = document.createElement('button');
        removeBtn.textContent = "Remove";
        removeBtn.style.marginLeft = "10px";
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          chrome.runtime.sendMessage({ action: "removeGroupBookmark", groupName: group.groupName }, () => {
            loadBookmarks();
            showStatus("Group removed successfully.");
          });
        });
        li.appendChild(removeBtn);
        bookmarkList.appendChild(li);
      });
    });
  }

  saveSessionBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "saveSession" }, (response) => {
      showStatus(response.status);
    });
  });

  restoreSessionBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "restoreSession" }, (response) => {
      showStatus(response.status);
    });
  });

  bookmarkGroupBtn.addEventListener('click', () => {
    const groupName = groupNameInput.value.trim();
    if (!groupName) {
      showStatus("Please enter a group name.");
      return;
    }
    chrome.runtime.sendMessage({ action: "bookmarkGroup", groupName: groupName }, (response) => {
      showStatus(response.status);
      loadBookmarks();
    });
  });

  optionsBtn.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options.html'));
    }
  });

  loadBookmarks();
});


document.addEventListener('DOMContentLoaded', function() {
  const saveSessionBtn = document.getElementById('saveSessionBtn');
  const restoreSessionBtn = document.getElementById('restoreSessionBtn');
  const bookmarkGroupBtn = document.getElementById('bookmarkGroupBtn');
  const bookmarkList = document.getElementById('bookmarkList');
  const groupNameInput = document.getElementById('groupNameInput');
  const optionsBtn = document.getElementById('optionsBtn');
  
  // Load bookmarks (existing functionality)
  function loadBookmarks() {
    chrome.runtime.sendMessage({ action: "getGroupBookmarks" }, (response) => {
      const groups = (response && response.groups) || [];
      bookmarkList.innerHTML = "";
      groups.forEach(group => {
        let li = document.createElement('li');
        li.textContent = group.groupName;
        li.style.cursor = "pointer";
        li.addEventListener('click', () => {
          chrome.runtime.sendMessage({ action: "restoreGroup", groupName: group.groupName }, (resp) => {
            alert(resp ? resp.status : "No response");
          });
        });
        let removeBtn = document.createElement('button');
        removeBtn.textContent = "Remove";
        removeBtn.style.marginLeft = "10px";
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          chrome.runtime.sendMessage({ action: "removeGroupBookmark", groupName: group.groupName }, () => {
            loadBookmarks();
          });
        });
        li.appendChild(removeBtn);
        bookmarkList.appendChild(li);
      });
    });
  }
  
  // Existing button event listeners
  saveSessionBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "saveSession" }, (response) => {
      alert(response.status);
    });
  });
  
  restoreSessionBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "restoreSession" }, (response) => {
      alert(response.status);
    });
  });
  
  bookmarkGroupBtn.addEventListener('click', () => {
    const groupName = groupNameInput.value.trim();
    if (!groupName) {
      alert("Please enter a group name.");
      return;
    }
    chrome.runtime.sendMessage({ action: "bookmarkGroup", groupName: groupName }, (response) => {
      alert(response.status);
      loadBookmarks();
    });
  });
  
  // New Options button event listener.
  optionsBtn.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options.html'));
    }
  });
  
  loadBookmarks();
});

document.addEventListener('DOMContentLoaded', function() {
  const freezeEnabledCheckbox = document.getElementById('pageFreezerEnabledCheckbox');
  const freezeAfterInput = document.getElementById('freezeAfterSeconds');
  const frozenCloseInput = document.getElementById('frozenCloseSeconds');
  const autoGroupingCheckbox = document.getElementById('autoGroupingCheckbox');
  const basicGroupingRadio = document.getElementById('basicGroupingRadio');
  const smartGroupingRadio = document.getElementById('smartGroupingRadio');
  const extensionEnabledCheckbox = document.getElementById('extensionEnabledCheckbox');
  const saveOptionsBtn = document.getElementById('saveOptionsBtn');
  
  // Load saved settings with defaults.
  chrome.storage.sync.get({
    pageFreezerEnabled: true,
    freezeAfterSeconds: 5,
    frozenCloseSeconds: 300,
    autoGroupingEnabled: true,
    groupingMode: "smart",
    extensionEnabled: true
  }, (data) => {
    freezeEnabledCheckbox.checked = data.pageFreezerEnabled;
    freezeAfterInput.value = data.freezeAfterSeconds;
    frozenCloseInput.value = data.frozenCloseSeconds;
    autoGroupingCheckbox.checked = data.autoGroupingEnabled;
    extensionEnabledCheckbox.checked = data.extensionEnabled;
    if (data.groupingMode === "basic") {
      basicGroupingRadio.checked = true;
    } else {
      smartGroupingRadio.checked = true;
    }
  });
  
  saveOptionsBtn.addEventListener('click', () => {
    const freezeAfterSeconds = parseInt(freezeAfterInput.value);
    const frozenCloseSeconds = parseInt(frozenCloseInput.value);
    if (isNaN(freezeAfterSeconds) || freezeAfterSeconds < 1) {
      alert("Please enter a valid number of seconds (minimum 1) for freeze delay.");
      return;
    }
    if (isNaN(frozenCloseSeconds) || frozenCloseSeconds < 1) {
      alert("Please enter a valid number of seconds (minimum 1) for frozen tab close delay.");
      return;
    }
    const groupingMode = basicGroupingRadio.checked ? "basic" : "smart";
    
    chrome.storage.sync.set({
      pageFreezerEnabled: freezeEnabledCheckbox.checked,
      freezeAfterSeconds: freezeAfterSeconds,
      frozenCloseSeconds: frozenCloseSeconds,
      autoGroupingEnabled: autoGroupingCheckbox.checked,
      groupingMode: groupingMode,
      extensionEnabled: extensionEnabledCheckbox.checked
    }, () => {
      alert("Options saved.");
    });
  });
});



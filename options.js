document.addEventListener('DOMContentLoaded', function() {
  const autoCloseInput = document.getElementById('autoCloseMinutes');
  const saveOptionsBtn = document.getElementById('saveOptionsBtn');

  // Load the saved threshold (default is 10 minutes)
  chrome.storage.sync.get({ autoCloseMinutes: 10 }, (data) => {
    autoCloseInput.value = data.autoCloseMinutes;
  });

  // Save the new threshold when the user clicks "Save Options"
  saveOptionsBtn.addEventListener('click', () => {
    const minutes = parseInt(autoCloseInput.value);
    if (isNaN(minutes) || minutes < 1) {
      alert("Please enter a valid number of minutes (minimum 1).");
      return;
    }
    chrome.storage.sync.set({ autoCloseMinutes: minutes }, () => {
      alert("Options saved.");
    });
  });
});

/* Shared by all dashboard menus in the Android app. */
(function () {
  'use strict';
  let exiting = false;
  window.zukaitExitApp = function () {
    if (exiting) return false;
    const bridge = window.AndroidBridge;
    if (!bridge || typeof bridge.exitApp !== 'function') {
      window.alert('Exit App is available in the updated Android app. In a browser, close this tab.');
      return false;
    }
    if (!window.confirm('Exit Zukait Time Track? Your login and running work timers will be kept.')) return false;
    exiting = true;
    try {
      bridge.exitApp();
      return true;
    } catch (error) {
      exiting = false;
      window.alert('Unable to exit the app. Please try again.');
      return false;
    }
  };
  const style = document.createElement('style');
  style.textContent = '.v93-menu-exit,.v88-exit,.v65-account .v65-exit,.v135-action.exit{background:#edf2f7!important;color:#183b56!important;border:1px solid #bdcbd9!important}';
  document.head.appendChild(style);
})();

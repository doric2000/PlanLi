'use strict';

// Source-level triage only. The release also compares the actual EAS fingerprint
// to the installed binary; a file list alone cannot establish OTA compatibility.
function isNativeReleaseInput(file) {
  const name = String(file).replace(/\\/g, '/').replace(/^\.\//, '');
  return /^client\/(?:modules\/|plugins\/|ios\/|android\/|patches\/)/.test(name)
    || /^client\/(?:app\.json|app\.config\.[cm]?[jt]s|eas\.json|package(?:-lock)?\.json|GoogleService-Info\.plist|google-services\.json|\.gitignore|\.easignore|\.fingerprintignore|fingerprint\.config\.[cm]?js|react-native\.config\.[cm]?js)$/.test(name);
}

module.exports = { isNativeReleaseInput };

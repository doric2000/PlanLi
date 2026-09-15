(() => {
  'use strict';
  const button = document.getElementById('open-app');
  const status = document.getElementById('status');
  const parts = window.location.pathname.split('/').filter(Boolean);
  const token = parts[0] === 'trip' && /^[A-Za-z0-9_-]{40,128}$/.test(parts[1] || '') ? parts[1] : '';
  if (!token) {
    button.disabled = true;
    status.textContent = 'הקישור אינו תקין. בקשו מבעל הטיול קישור חדש.';
    return;
  }
  button.addEventListener('click', () => {
    status.textContent = 'פותחים את PlanLi…';
    window.location.assign(`com.planli.planlitravels://shared-trip/${encodeURIComponent(token)}`);
  });
})();

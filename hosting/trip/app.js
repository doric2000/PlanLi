(() => {
  'use strict';
  const button = document.getElementById('open-app');
  const status = document.getElementById('status');
  const links = window.PlanLiLinks;
  const target = links.parsePath(window.location.pathname);
  document.getElementById('ios-store').href = links.stores.ios;
  document.getElementById('android-store').href = links.stores.android;
  if (!target || window.location.search || window.location.hash) {
    button.disabled = true;
    status.textContent = 'הקישור אינו תקין. בקשו מהשולח קישור חדש.';
    return;
  }
  if (links.legacyOrigins.includes(window.location.origin)) {
    window.location.replace(links.shareUrl(target.kind, target.id));
    return;
  }
  const privateTrip = target.kind === 'trip';
  const label = privateTrip ? 'הטיול' : target.kind === 'route' ? 'המסלול' : 'ההמלצה';
  document.getElementById('title').textContent = `${label} מחכה לך באפליקציה`;
  document.getElementById('eyebrow').textContent = privateTrip ? 'קישור פרטי' : 'שותף איתך ב־PlanLi';
  document.getElementById('description').textContent = privateTrip
    ? 'מתחברים ל־PlanLi וצופים בימים, בעצירות ובמפה. הטיול נשאר פרטי ואי אפשר לערוך את המקור.'
    : `פותחים את PlanLi וצופים ב${target.kind === 'route' ? 'מסלול' : 'המלצה'} ובכל הפרטים.`;
  button.disabled = false;
  button.addEventListener('click', () => {
    status.textContent = 'פותחים את PlanLi… אם האפליקציה לא נפתחה, התקינו או עדכנו אותה דרך החנות.';
    window.location.assign(links.deepLink(target.kind, target.id));
  });
})();

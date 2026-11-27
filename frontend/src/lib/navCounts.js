// The sidebar shows what is open on each work page (badges). A page calls this after an action so the badge
// updates at once (it also refreshes on its own every 30 seconds and when the page changes).
export const NAV_COUNTS_EVENT = 'crm:nav-counts';
export const refreshNavCounts = () => window.dispatchEvent(new Event(NAV_COUNTS_EVENT));

import { APP_CONFIG } from './config.js';

const SESSION_KEY = 'ginsoft-pos-session-user';
const LICENSE_STATUS_KEY = 'pos-license-status';
const LICENSE_LOCKED_STATUSES = ['unlicensed', 'expired', 'inactive', 'invalid'];
const LICENSE_SAFE_ROUTES = ['license', 'backup'];

export const sanitizeUser = (user = {}) => ({
  id: user.id,
  user_id: user.user_id,
  full_name: user.full_name,
  role: user.role,
  status: user.status || 'active',
  hotel_id: user.hotel_id || '',
  cloud_user: Boolean(user.cloud_user)
});

export const getCurrentUser = () => {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  } catch (_) {
    return null;
  }
};

export const setCurrentUser = (user) => {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(sanitizeUser(user)));
};

export const clearCurrentUser = () => sessionStorage.removeItem(SESSION_KEY);

export const setLicenseStatus = (status = 'valid') => {
  localStorage.setItem(LICENSE_STATUS_KEY, String(status || 'valid').toLowerCase());
};

export const getLicenseStatus = () =>
  String(localStorage.getItem(LICENSE_STATUS_KEY) || 'valid').toLowerCase();

export const isLicenseAccessLocked = () =>
  LICENSE_LOCKED_STATUSES.includes(getLicenseStatus());

export const canAccessRoute = (user, routeId) => {
  if (!user?.role) return false;
  if (getLicenseStatus() === 'unlicensed') return routeId === 'license';
  if (isLicenseAccessLocked()) return LICENSE_SAFE_ROUTES.includes(routeId);
  const access = APP_CONFIG.roleAccess[user.role] || [];
  return access.includes('*') || access.includes(routeId);
};

export const visibleRoutesForUser = (user) =>
  APP_CONFIG.routes.filter(route => canAccessRoute(user, route.id));

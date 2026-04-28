export const riskTone = {
  LOW_RISK: 'low',
  MEDIUM_RISK: 'medium',
  HIGH_RISK: 'high',
  CRITICAL_RISK: 'critical',
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'critical'
};

export function prettyRisk(value) {
  return String(value || 'UNKNOWN')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function prettyPlatform(value) {
  return String(value || 'Unknown').replace(/_/g, '/');
}

export function compactNumber(value) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
}

export function percent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

export function formatDate(value) {
  if (!value) return 'Unknown';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

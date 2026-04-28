const HIGH_PRIORITY_HIGHLIGHTS = Object.freeze([
  'Goal',
  'Wicket',
  'Six',
  'Final moment',
  'Controversial moment',
  'Full highlight package'
]);

const HIGHLIGHT_PRIORITY_WEIGHTS = Object.freeze({
  Goal: 92,
  Wicket: 88,
  Six: 82,
  'Final moment': 95,
  'Controversial moment': 90,
  'Full highlight package': 100,
  Celebration: 68,
  Save: 64,
  Boundary: 72,
  Assist: 58,
  'Press conference': 30
});

module.exports = {
  HIGH_PRIORITY_HIGHLIGHTS,
  HIGHLIGHT_PRIORITY_WEIGHTS
};

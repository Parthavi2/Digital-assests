const {
  HIGH_PRIORITY_HIGHLIGHTS,
  HIGHLIGHT_PRIORITY_WEIGHTS
} = require('../constants/highlightCategories');

const calculateHighlightPriority = (asset) => {
  const category = asset.highlightCategory;
  const highlightPriorityScore = HIGHLIGHT_PRIORITY_WEIGHTS[category] || 45;
  const commercialValueWeight = Number((highlightPriorityScore / 100).toFixed(2));
  const isHighPriority = HIGH_PRIORITY_HIGHLIGHTS.includes(category);

  return {
    highlightPriorityScore,
    commercialValueWeight,
    priorityReason: isHighPriority
      ? `${category} is a high-value sports moment with strong commercial and broadcast rights sensitivity.`
      : `${category} has standard rights sensitivity and is monitored for repeated or monetized reuse.`
  };
};

module.exports = { calculateHighlightPriority };

const db = require("./db.js");

function getCategories() {
  return db.getRubricCategories().map((row) => ({
    id: row.id,
    name: row.name,
    weight: row.weight,
    description: row.description,
    sortOrder: row.sort_order,
  }));
}

function saveCategories(categories) {
  db.saveRubricCategories(categories);
  return getCategories();
}

function getThresholds() {
  return db.getRubricThresholds();
}

function saveThresholds(thresholds) {
  db.saveRubricThresholds(thresholds);
  return getThresholds();
}

module.exports = { getCategories, saveCategories, getThresholds, saveThresholds };

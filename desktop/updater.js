function checkForUpdate(app, session, db) {
  const stored = db.getMeta("app_version");
  const current = app.getVersion();
  if (stored !== current) {
    session.defaultSession.clearCache();
    db.setMeta("app_version", current);
  }
}

module.exports = { checkForUpdate };

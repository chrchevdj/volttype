function getElectronModule() {
  if (global.__VOLTTEST_ELECTRON__) {
    return global.__VOLTTEST_ELECTRON__;
  }

  const electron = require('electron');
  if (electron?.app || electron?.net) {
    return electron;
  }

  return electron?.default || {};
}

function getApp() {
  return getElectronModule().app;
}

function getNet() {
  return getElectronModule().net;
}

module.exports = {
  getApp,
  getNet,
};

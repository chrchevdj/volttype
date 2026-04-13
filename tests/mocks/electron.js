const state = {
  userData: '',
  fetchImpl: async () => {
    throw new Error('electron.net.fetch mock not configured');
  },
  loginSettings: {
    openAtLogin: false,
  },
};

const app = {
  getPath(name) {
    if (name === 'userData') {
      return state.userData;
    }
    return '';
  },
  setLoginItemSettings(value) {
    state.loginSettings = { ...state.loginSettings, ...value };
  },
  getLoginItemSettings() {
    return state.loginSettings;
  },
};

const net = {
  fetch(...args) {
    return state.fetchImpl(...args);
  },
};

module.exports = {
  app,
  net,
  __electronMockState: state,
  default: {
    app,
    net,
  },
};

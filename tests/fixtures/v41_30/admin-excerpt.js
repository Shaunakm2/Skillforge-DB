SkillforgeApp.prototype.adminVals = function (s, all) {
  const scrV = this._scrV, role = this.roleOf(s), isAdm = !!role.admin;
  const vals = { canAdmin: true,
    toggleAdmin: () => this.go('admin', { adminView:true, setTab: s.setTab || null }),
    goHomeRole: () => this.goHomePage(),   // v41.20: the logo always opens the LMS home page
    showAdminBack: s.adminView && s.screen !== 'admin' && s.screen !== 'batch', goAdminHome: () => this.go('admin'), backToLearning: () => this.go('home', {}),
    isAdminHome: scrV === 'admin',
  };
  return vals;
};

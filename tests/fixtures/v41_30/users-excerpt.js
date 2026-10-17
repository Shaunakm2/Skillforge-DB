/* Skillforge LMS — users and accounts. */
SkillforgeApp.prototype.amUsers = function (c) {
  const { s } = c, userAll = s.users;
  const ud = s.ud || { id:null, joined:TODAY_KEY };
  const V = {
    uMenuClose: () => this.setState({ uMenu: null }),
    createSingle: () => this.setState({ uMenu: null, userModal:true, ud:null }),
    createBulk: () => this.setState({ uMenu: null, uImp: {} }),
    exportUsersMenu: () => { this.setState({ uMenu: null }); V.exportUsers(); },
    userStatusChips: [],
    exportUsers: () => { csvDownload('teammates-' + s.userStatus.toLowerCase() + '-' + TODAY_KEY + '.csv', [['Employee ID', 'Name']]
        .concat(userAll.map(u => [u.empId, u.name])));
      this.toastMsg(userAll.length.toLocaleString('en-US') + ' teammates exported'); },
    newUser: () => this.setState({ userModal:true, ud:null }),
    saveUser: () => { if (ud.joined && ud.joined > Progress.plus(TODAY_KEY, 180)) return this.toastMsg('Date of joining can’t be more than 6 months ahead'); },
  };
  return V;
};

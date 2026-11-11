/* Administrator authority comes from server-controlled account metadata. */
(() => {
  globalThis.PTIdentity = {
    isAdmin: user => !!user?.id && user.app_metadata?.role === 'admin',
    mustChange: user => user?.app_metadata?.must_change_password === true
  };
})();

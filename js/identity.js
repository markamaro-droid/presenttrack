/* Usernames identify provisioned administrator accounts; students use email. */
(() => {
  const username = /^[a-z][a-z0-9_-]{2,31}$/;
  const domain = 'admin.presenttrack.invalid';
  globalThis.PTIdentity = {
    valid: value => username.test(value),
    email: value => value.includes('@') ? value : `${value}@${domain}`,
    username: user => (user?.email || '').endsWith('@' + domain) ? user.email.split('@')[0] : '',
    isAdmin: user => !!user?.id && user.app_metadata?.role === 'admin',
    mustChange: user => user?.app_metadata?.must_change_password === true
  };
})();

export function billingConfig(env = process.env) {
  const plans = ['weekly', 'monthly', 'annual'].map((id, i) => {
    const amount = Number(env['BILLING_' + id.toUpperCase() + '_CENTAVOS'] || [4900,14900,99900][i]);
    if (!Number.isSafeInteger(amount) || amount < 2000 || amount > 100000000) throw Error('Invalid billing price: ' + id);
    return { id, amount, currency: 'PHP', label: ['Weekly','Monthly','Annual'][i] };
  });
  const users = (env.BILLING_TEST_USERS || '').split(',').map(x => x.trim()).filter(Boolean);
  return { enabled: env.BILLING_MODE === 'test', trialDays: 7, plans, users };
}

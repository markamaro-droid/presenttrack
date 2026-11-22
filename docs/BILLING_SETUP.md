# Test billing setup

This implementation uses PayMongo hosted checkout with GCash and Maya, in PHP. It accepts test keys only. It does not collect real money or automatically renew plans.

## Where to find it

- Students: sidebar → **Billing**, under System (scroll the sidebar if necessary).
- Administrators: sidebar → **Payments**. Change the initial admin password first.
- Prices remain visible as a preview before configuration, with checkout disabled. Admins see missing configuration and the latest 100 account/order records. User IDs can be matched in Supabase Authentication → Users.

## Setup steps

1. In Supabase SQL Editor, run `supabase/migrations/20261122_test_billing.sql`. If you already ran it, no repeat is needed for the UI update. These tables are separate from existing user data. They are accessible only through authenticated server endpoints using the service role.
2. Open your PayMongo dashboard in **test mode**. In Developers, obtain the secret API key beginning `sk_test_`. Confirm GCash and Maya are available for your merchant's test checkout.
3. In Supabase Authentication → Users, copy the UUID of a dedicated test user. Do not use an email address for the test list.
4. Add the following **server environment variables** to Vercel for the deployment you will test. For local development, put them in `.env.local`. Never commit that file or put secret keys in `js/config.js`.

   ```dotenv
   BILLING_MODE=test
   BILLING_SITE_URL=https://presenttrack-nu.vercel.app
   BILLING_TEST_USERS=REPLACE_WITH_TEST_USER_UUID
   BILLING_ENFORCE_TEST=false
   BILLING_WEEKLY_CENTAVOS=4900
   BILLING_MONTHLY_CENTAVOS=14900
   BILLING_ANNUAL_CENTAVOS=99900
   PAYMONGO_TEST_SECRET_KEY=REPLACE_WITH_SK_TEST_KEY
   PAYMONGO_TEST_WEBHOOK_SECRET=REPLACE_WITH_WEBHOOK_SECRET
   ```

   Existing `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` must refer to the same project. Multiple tester UUIDs can be comma-separated. Prices are placeholders: ₱49/week, ₱149/month, ₱999/year. Amounts are in centavos. These are not approved live prices.
5. Push the code yourself and wait for Vercel to finish deploying. Local files and SQL changes alone cannot update the website. Environment changes also require redeployment.
6. In PayMongo Developers → Webhooks, register a **test** endpoint at `https://presenttrack-nu.vercel.app/api/billing-webhook`, subscribing to `checkout_session.payment.paid`. Copy that endpoint's signing secret into `PAYMONGO_TEST_WEBHOOK_SECRET`, then redeploy. Use your own deployment URL if different; the webhook must be reachable by PayMongo.
7. Sign in as your test student. Open Billing → **Start 7-day free trial**. The trial starts when clicked, once per account. Reloading or clicking again cannot restart it.
8. Choose a plan and complete the PayMongo simulated GCash/Maya checkout. On return, open Billing → **Refresh payment status**. Returning to the website is not proof of payment: access is granted only after the server verifies the provider's payment. The webhook normally updates it automatically; Refresh checks the newest pending checkout.
9. Check Payments as admin. Confirm the order is Paid and the access expiry increased. Repeat separately with the other wallet. Cancel a checkout and verify it remains pending and does not grant access. Repeated webhook deliveries must not add access twice.
10. To test expiry, set `BILLING_ENFORCE_TEST=true` and redeploy. For a designated test account without an active trial or paid period, new recording analysis, AI chat/voice-session requests, presentation understanding, and explanation review return a billing-required error. Starting the trial or confirming payment restores these actions. Existing provider quotas still apply. Reading history, library browsing, uploads, account controls, and tour narration remain available. This is a test gate on AI features, not a live site-wide paywall. Accounts outside the explicit test list remain unaffected.

## Renewal and recovery

Each checkout buys one period: 7 days, 1 calendar month, or 1 calendar year. Early payments extend access after the latest current trial/paid expiry. An expired account extends from payment processing time. No future wallet deductions are authorized. Trial expiry does not automatically charge anything.

If confirmation times out, refresh status before paying again. The browser retains a checkout request ID per account/plan to resume the same checkout. If an order remains pending without a checkout URL after a provider/network failure, the administrator must reconcile it against PayMongo before removing that abandoned test order. Do not delete a payment that may have succeeded.

The admin screen reports configuration presence, not a successful connection test. Full wallet tests require your PayMongo account and keys; automated local tests use simulated provider responses.

## Before real payments

Live payments are intentionally rejected. A live launch needs a separate implementation/configuration, merchant activation, approved prices and terms, refund/dispute handling, production access rules, and end-to-end merchant tests. This version does not reverse access after refunds or disputes. Do not replace the test secret with a live key.

Optional auto-renewal can be added after merchant activation and explicit user consent, together with cancellation controls. PayMongo's subscription documentation lists Maya and cards; do not offer GCash auto-renewal without provider confirmation. Manual GCash/Maya checkout does not authorize recurring deductions.

References: [Hosted checkout](https://docs.paymongo.com/docs/payment-channels-hosted-checkout-quick-start), [webhook signatures and setup](https://docs.paymongo.com/docs/developer-tools-webhook-setup-management), [supported subscriptions](https://docs.paymongo.com/docs/payment-acceptance-subscriptions).

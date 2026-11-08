# Stripe Checkout integration TODO

## Current status

A minimal hosted Checkout endpoint has been added to `server.js` for **test-mode experimentation only**. It creates a one-time Checkout Session using a configured Stripe Price ID. It is not yet a production marketplace payment flow and does not verify or complete an order.

## Required Render environment variables

- `STRIPE_SECRET_KEY`: Stripe **test** secret key for testing. Never put this in frontend code or commit it.
- `STRIPE_PRICE_ID`: test-mode Price ID for the €1 test product created in Stripe.
- `STRIPE_SUCCESS_URL`: optional success return URL; otherwise the GitHub Pages URL is used.
- `STRIPE_CANCEL_URL`: optional cancel return URL; otherwise the GitHub Pages URL is used.

## Required project setup

1. Add the official `stripe` Node package to the backend dependencies and deploy it with the existing runtime. The repository currently has no `package.json`, so dependency installation/start configuration must be confirmed before deployment.
2. Keep Stripe in test mode. Do not accept real payments.
3. Confirm the configured Checkout features and shipping countries in Stripe Dashboard. Automatic tax requires the appropriate Stripe Tax configuration and does not by itself establish that tax obligations are satisfied.
4. The current endpoint uses one fixed Price ID. It is only suitable for testing the hosted page; it does not use a verified marketplace listing/order price and does not route funds to sellers.
5. Before a real marketplace launch, design and implement a proper order payment flow: server-side listing/order validation, Stripe Connect onboarding and seller eligibility, payment destination/application fee rules, signed webhook verification, idempotency, and order status changes only after a verified successful payment.
6. Review and secure the existing `/api/orders/:id/pay` and order-status routes. A browser request must never be able to mark an order as paid.
7. Confirm Stripe account eligibility and legal/guardian requirements with Stripe Support before activating payments. Do not misstate account holder identity or age.

## SDK / API compatibility

- The endpoint requests `ui_mode: "hosted_page"` as specified by the Checkout Studio export.
- Confirm the installed Stripe Node SDK version supports `hosted_page` and the configured Checkout parameters before deployment. The repository did not contain a `package.json` to verify the SDK version.
- The Checkout Studio export specified Stripe API version `2026-10-28.endive`; this code deliberately does not pin an API version because the existing project's Stripe SDK/client configuration was not present.

## Important

The success redirect is not proof of payment. Do not fulfill an order based on the redirect or the browser response. Only a verified Stripe webhook event may confirm payment.

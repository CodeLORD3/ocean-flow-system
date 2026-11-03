# Mensur sees no store orders, not even in Grossist

## What is already checked
- Mensur Mehamed has access to FSAB, DE No.1 and Componia, plus the Grossist and Store portals. By the rules, he should be able to read all store orders.
- There are orders to show: in the last 14 days, 12 new, 1 in progress, 6 packed and 21 delivered.
- He opened Grossist → Orders as recently as 2 November at 07:18.
- The cause is therefore **not yet confirmed**. It is either a fault when the list is fetched for his account (such as a time-out or a rejected request) or a filter that hides the orders on his screen.

## Steps
1. **Reproduce as Mensur**: sign in to the preview as his account (this needs your approval), open Grossist → Orders and capture a screenshot, error messages and the server's response to the order request.
2. **Find the cause** from what step 1 shows:
   - The request fails or times out → fix the order fetch, for example by reading the lines page by page. The order fields stay the same.
   - The request returns orders but nothing shows → find the filter that hides them (search, status, store, production status, saved settings on his device) and fix or reset it.
   - Access is refused → fix his access within the existing rules for company separation. No admin role.
3. **Verify** as Mensur that today's orders show up. Then check that an admin and a store user still see the same as before.
4. Add a small test for the fault that was found.

## Limits
- No order data, stock movements or accounting is changed.
- Mensur gets no new roles unless that turns out to be the cause and you approve it.

## Technical details
- The list comes from `useShopOrders()` in `WholesaleOrders.tsx`, filtered by the rules for `is_staff()` and `can_see_company()`. His scopes are the three companies (`entity`) plus the `production`/`shop` portals.
- Order lines are fetched in the same request with nested product data, and the backend returns at most 1000 rows per request. That can cut off or slow down the list, but it has not been confirmed as the cause.

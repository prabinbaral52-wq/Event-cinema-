# Security Specification - Event cinema ( Gole complex)

## 1. Data Invariants
1. Every document in `/orders/{orderId}` must have a valid, bounded, high-entropy alphanumeric/dash `orderId` (`16 <= orderId.size() <= 64`, matching `^[a-zA-Z0-9_-]+$`).
2. Orders must contain ONLY the exact allowlisted fields: `ticketId`, `seat`, `screen`, `items`, `itemCount`, `paymentMethod`, `note`, `status`, `createdAt`, `updatedAt`. No shadow/ghost fields are allowed.
3. On `create`, `status` MUST be `'pending'`, and both `createdAt` and `updatedAt` MUST equal `request.time`.
4. `items` MUST be a non-empty bounded list (`1 <= items.size() <= 10`) where `items[0]` is a strict map containing only `id`, `name`, and `quantity` with bounded types/sizes.
5. Every string field (`ticketId`, `seat`, `screen`, `note`, `status`, `paymentMethod`) has strict `.size()` upper bounds to prevent storage exhaustion.
6. On `update`, `createdAt`, `ticketId`, `seat`, `screen`, `items`, `itemCount`, `paymentMethod`, and `note` are immutable (unless modified by a verified admin); only `status` and `updatedAt` can transition along valid forward states (`pending` -> `preparing` | `delivered` | `cancelled`; `preparing` -> `delivered` | `cancelled`).
7. Terminal states (`delivered`, `cancelled`) are locked against further updates unless overridden by a verified admin.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Shadow/Ghost Field Injection**: Creating an order with an extra field `isPaid: true` or `role: "admin"` -> MUST be denied by `keys().hasOnly(...)`.
2. **Short/Guessable or Poisoned Document ID**: Creating `/orders/1` or `/orders/bad$id!` or a 500-char ID -> MUST be denied by `isValidId(orderId)` and minimum length check.
3. **State Shortcutting on Create**: Creating an order with `status: "delivered"` directly -> MUST be denied by `incoming().status == 'pending'`.
4. **Timestamp Forgery on Create**: Creating an order with client-forged `createdAt` or `updatedAt` != `request.time` -> MUST be denied.
5. **Empty Items Array**: Creating an order with `items: []` -> MUST be denied by `items.size() >= 1`.
6. **Oversized Items Array (DoW)**: Creating an order with 500 line items -> MUST be denied by `items.size() <= 10`.
7. **Invalid Item Map Shape**: Creating an order where `items[0]` is a string or missing `quantity` or `quantity: -5` -> MUST be denied by `isValidOrderItem(incoming().items[0])`.
8. **Oversized Note String**: Creating an order with a 10KB `note` -> MUST be denied by `note.size() <= 200`.
9. **Invalid Payment Method**: Creating an order with `paymentMethod: "crypto"` -> MUST be denied by `in ['fonepay', 'cash']`.
10. **Immutable Field Tampering on Update**: Updating an order to change `seat` or `items` or `createdAt` -> MUST be denied by `affectedKeys().hasOnly(['status', 'updatedAt'])` and equality guards.
11. **Terminal State Reopening**: Updating an order whose `existing().status == 'delivered'` back to `'pending'` -> MUST be denied by terminal state lock.
12. **Backward State Regression**: Updating `'preparing'` back to `'pending'` -> MUST be denied by state transition rules.

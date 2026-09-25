# Spare Parts Module (isolated)

This folder is the standalone Architecture V2 Spare Parts module. It is intentionally **not wired into the main app/dashboard yet**.

Design rules:
- One master Parts List per Job Card; additional parts stay on the same PL.
- Supervisor/Manager create lists. Purchaser handles enquiry/order/arrival. Supervisor accepts physical arrivals and records final price. Manager can edit everything; every important correction retains audit history.
- Denter sees operational part status but no price/quotation values.
- Quotation is optional: three shop names (A/B/C), three price columns, OMR/AED, original currency retained, OMR equivalent stored with the quote-time conversion rate.
- New list ages for 3 workshop working days before the normal Parts List view.
- Purchase completion is automatic when all required lines are resolved.
- Delivered Vehicle - Pending Parts is a manual Supervisor/Manager move; purchasing continues on the same PL.
- Reports use final actual OMR price/final purchase date. Quotation values never count as actual purchase totals.
- Manager reporting contract: today/week/month/custom period, per-JC, initial vs additional cost, cap status, quotation history, pending/completed, printable/PDF/WhatsApp when UI integration is later enabled.
- Common UI rule for later integration: Print / PDF / WhatsApp / Back-Close.
- No supplier master, inventory ERP, formal PO bureaucracy, or repeated fields already available from Job Card/login/system timestamps.

#!/usr/bin/env python3
"""
seed_oct_nov_expenses.py
Inserts the October–November 2026 billing cycle expenses for user_id=1.
Run from the backend/ directory:  python3 seed_oct_nov_expenses.py
"""

import sqlite3
from pathlib import Path

DB = Path(__file__).parent / "expense.db"

# ── Category map (from data label → existing DB id) ──────────────────────────
CAT = {
    "INVESTMENT": 6,
    "FOOD": 2,
    "LIFESTYLE": 3,
    "TRAVEL": 4,
    "RENT": 1,
    "LOAN EMI": 5,  # maps to existing LOAN category
}

# ── Payment method map (from data label → existing DB id) ────────────────────
PM = {
    "Axis MyZone Rupay Card": 2,  # Axis Bank MyZone Credit Card
    "Axis Flipkart Card": 3,  # Axis Bank Flipkart Credit Card
    "SBI RELIANCE CARD": 13,  # SBI Reliance Credit Card
    "ICICI Rupay Card": 5,  # ICICI Rupay Credit Card
    "ICICI BANK": 11,  # ICICI Bank Savings Account
    "CENTRAL BANK": 12,  # CBI Savings Account
}

# ── Expense data ──────────────────────────────────────────────────────────────
# (date YYYY-MM-DD, description, amount, payment_method_label, category_label)
EXPENSES = [
    ("2026-10-13", "Gold Scheme", 25000.00, "Axis MyZone Rupay Card", "INVESTMENT"),
    ("2026-10-15", "Dinner from zomato", 270.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-10-16", "Dmart shopping online", 1006.00, "Axis MyZone Rupay Card", "LIFESTYLE"),
    ("2026-10-17", "Urban company fan repair", 298.00, "Axis MyZone Rupay Card", "LIFESTYLE"),
    ("2026-10-18", "Curd, milk and veggies", 316.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-10-18", "Banana & Apples", 147.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-10-18", "Chicken", 540.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-10-18", "Laundry", 620.00, "Axis MyZone Rupay Card", "LIFESTYLE"),
    ("2026-10-19", "Movie Ticket", 56.00, "SBI RELIANCE CARD", "LIFESTYLE"),
    ("2026-10-19", "Hair Medicine", 302.00, "Axis MyZone Rupay Card", "LIFESTYLE"),
    ("2026-10-19", "Groceries", 795.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-10-19", "Petrol - 5L", 555.00, "Axis MyZone Rupay Card", "TRAVEL"),
    ("2026-10-21", "Bike Parking", 20.00, "Axis MyZone Rupay Card", "TRAVEL"),
    ("2026-10-21", "Biryani from zomato", 346.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-10-21", "Milk & soft drink from flipkart minutes", 231.00, "Axis Flipkart Card", "FOOD"),
    ("2026-10-22", "Biryani for dinner from toing", 317.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-10-23", "Biryani from ownly", 300.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-10-24", "Banana & carrot", 70.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-10-24", "Apple Cloud Subscription", 219.00, "Axis MyZone Rupay Card", "LIFESTYLE"),
    (
        "2026-10-25",
        "Protein powder for chak from Flipkart Minutes",
        4017.00,
        "Axis Flipkart Card",
        "FOOD",
    ),
    ("2026-10-25", "Haircut", 300.00, "Axis MyZone Rupay Card", "LIFESTYLE"),
    ("2026-10-25", "Chicken", 460.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-10-25", "Groceries from Reliance fresh", 200.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-10-26", "Grocery from Flipkart Minutes", 442.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-10-29", "Biryani dinner from Ownly", 263.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-10-29", "Laundry", 415.00, "Axis MyZone Rupay Card", "LIFESTYLE"),
    ("2026-10-29", "Petrol - 2L", 222.00, "CENTRAL BANK", "TRAVEL"),
    ("2026-10-29", "Vegetables", 170.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-10-30", "Rent", 8000.00, "ICICI BANK", "RENT"),
    ("2026-10-31", "Groceries from flipkart minutes", 349.00, "Axis Flipkart Card", "FOOD"),
    ("2026-11-01", "Chicken", 620.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-11-01", "Bike wash", 250.00, "Axis MyZone Rupay Card", "TRAVEL"),
    ("2026-11-01", "Groceries from amazon now", 368.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-11-01", "Water can", 20.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-11-01", "Fruits and vegetables", 424.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-11-02", "Petrol - 3L", 333.00, "Axis MyZone Rupay Card", "TRAVEL"),
    ("2026-11-03", "Phone stand from amazon", 154.00, "ICICI Rupay Card", "LIFESTYLE"),
    ("2026-11-03", "Biryani for dinner from zomato", 315.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-11-03", "RD", 20000.00, "ICICI BANK", "INVESTMENT"),
    ("2026-11-03", "NPS", 5000.00, "ICICI BANK", "INVESTMENT"),
    ("2026-11-03", "PPF", 5000.00, "ICICI BANK", "INVESTMENT"),
    ("2026-11-04", "Laundry", 475.00, "Axis MyZone Rupay Card", "LIFESTYLE"),
    ("2026-11-05", "Grocery from Amazon now", 422.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-11-05", "Biryani for lunch from zomato", 313.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-11-05", "Ice cream from zomato", 198.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-11-06", "SIP", 10100.00, "ICICI BANK", "INVESTMENT"),
    ("2026-11-06", "Loan EMI", 75000.00, "ICICI BANK", "LOAN EMI"),
    ("2026-11-06", "Rice from Dmart", 197.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-11-06", "Movie Ticket", 132.00, "Axis MyZone Rupay Card", "LIFESTYLE"),
    ("2026-11-06", "Biryani from Zomato", 256.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-11-07", "Groceries from star bazaar", 1127.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-11-08", "Petrol 5L", 602.00, "Axis MyZone Rupay Card", "TRAVEL"),
    ("2026-11-08", "Chicken", 400.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-11-09", "Bike coolant from amazon", 152.00, "ICICI BANK", "TRAVEL"),
    ("2026-11-10", "Groceries from amazon now", 198.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-11-11", "Banana & Diet Coke", 90.00, "Axis MyZone Rupay Card", "FOOD"),
    ("2026-11-11", "Laundry", 475.00, "Axis MyZone Rupay Card", "LIFESTYLE"),
    ("2026-11-11", "Shirts iron", 90.00, "CENTRAL BANK", "LIFESTYLE"),
    ("2026-11-11", "Air Fryer EMI", 2100.00, "Axis MyZone Rupay Card", "LIFESTYLE"),
]

# ── Insert ────────────────────────────────────────────────────────────────────


def main() -> None:
    con = sqlite3.connect(DB)
    cur = con.cursor()

    inserted = 0
    skipped = 0
    for date, desc, amount, pm_label, cat_label in EXPENSES:
        cat_id = CAT[cat_label]
        pm_id = PM[pm_label]

        # Idempotency guard: skip if an identical record already exists
        cur.execute(
            "SELECT id FROM expenses WHERE user_id=1 AND date=? AND description=? AND amount=?",
            (date, desc, amount),
        )
        if cur.fetchone():
            print(f"  SKIP (exists): {date}  {desc}")
            skipped += 1
            continue

        cur.execute(
            """
            INSERT INTO expenses (user_id, date, description, amount, payment_method_id, category_id, created_at)
            VALUES (1, ?, ?, ?, ?, ?, datetime('now'))
            """,
            (date, desc, amount, pm_id, cat_id),
        )
        print(f"  INSERT: {date}  {desc}  ₹{amount:,.2f}  [{cat_label}]")
        inserted += 1

    con.commit()
    con.close()

    total = sum(r[2] for r in EXPENSES)
    print(f"\n{'─' * 60}")
    print(f"  Inserted : {inserted}")
    print(f"  Skipped  : {skipped} (already existed)")
    print(f"  Total    : {inserted + skipped} records")
    print(f"  Cycle sum: ₹{total:,.2f}")
    print(f"{'─' * 60}")


if __name__ == "__main__":
    main()

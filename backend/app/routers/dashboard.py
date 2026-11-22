import calendar
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Category, Expense, FixedExpense, PaymentMethod, User, UserSettings
from app.schemas import CategoryBreakdown, DashboardSummary, MonthlySummary, PaymentBreakdown

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _billing_period(start_day: int, ref: date | None = None) -> tuple[date, date]:
    """
    Return (cycle_start, cycle_end) dates for the billing cycle that contains `ref`
    (defaults to today).

    Example with start_day=12:
      - If today is 2026-11-22  → cycle is 2026-11-12 … 2026-12-11
      - If today is 2026-11-05  → cycle is 2026-10-12 … 2026-11-11
    """
    today = ref or date.today()

    if today.day >= start_day:
        # cycle started this month
        cycle_start = today.replace(day=start_day)
    else:
        # cycle started last month
        first_of_this_month = today.replace(day=1)
        last_of_prev_month = first_of_this_month - timedelta(days=1)
        # guard: start_day may be > days in prev month (e.g. start_day=31 in Feb)
        actual_start_day = min(start_day, last_of_prev_month.day)
        cycle_start = last_of_prev_month.replace(day=actual_start_day)

    # cycle ends one day before the *next* cycle start
    if cycle_start.month == 12:
        next_start = cycle_start.replace(year=cycle_start.year + 1, month=1)
    else:
        next_start = cycle_start.replace(month=cycle_start.month + 1)
    cycle_end = next_start - timedelta(days=1)

    return cycle_start, cycle_end


def _past_billing_cycles(start_day: int, n: int) -> list[tuple[date, date]]:
    """
    Return the last `n` billing cycles (most recent last) based on start_day.
    Each cycle is (cycle_start, cycle_end).
    """
    cycles: list[tuple[date, date]] = []
    current_start, _ = _billing_period(start_day)
    for i in range(n - 1, -1, -1):
        month = current_start.month - i
        year = current_start.year
        while month <= 0:
            month += 12
            year -= 1
        last_day = calendar.monthrange(year, month)[1]
        s = date(year, month, min(start_day, last_day))
        if s.month == 12:
            e = s.replace(year=s.year + 1, month=1) - timedelta(days=1)
        else:
            e = s.replace(month=s.month + 1) - timedelta(days=1)
        cycles.append((s, e))
    return cycles


def _all_past_complete_cycles(start_day: int, earliest: date) -> list[tuple[date, date]]:
    """
    Return every complete billing cycle from the one containing `earliest` up to
    (but not including) the current cycle. Used to compute historical yearly savings.
    """
    current_start, _ = _billing_period(start_day)

    # Find the cycle that contains the earliest date
    first_start, _ = _billing_period(start_day, ref=earliest)

    cycles: list[tuple[date, date]] = []
    s = first_start
    while s < current_start:
        last_day = calendar.monthrange(s.year, s.month if s.month != 12 else 1)[1]
        if s.month == 12:
            e = s.replace(year=s.year + 1, month=1) - timedelta(days=1)
            next_s = s.replace(year=s.year + 1, month=1, day=min(start_day, calendar.monthrange(s.year + 1, 1)[1]))
        else:
            e = s.replace(month=s.month + 1) - timedelta(days=1)
            next_m = s.month + 1
            next_y = s.year
            next_s = s.replace(year=next_y, month=next_m, day=min(start_day, calendar.monthrange(next_y, next_m)[1]))
        cycles.append((s, e))
        s = next_s
    return cycles


@router.get("/summary", response_model=DashboardSummary)
def get_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    settings = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    start_day = settings.billing_cycle_start_day if settings else 1
    monthly_salary = settings.monthly_salary if settings else 0.0

    cycle_start, cycle_end = _billing_period(start_day)
    start_str, end_str = str(cycle_start), str(cycle_end)

    rows = (
        db.query(Expense)
        .filter(
            Expense.user_id == current_user.id,
            Expense.date >= start_str,
            Expense.date <= end_str,
        )
        .all()
    )

    total_spent = sum(e.amount for e in rows)
    transaction_count = len(rows)

    days_in_cycle = (cycle_end - cycle_start).days + 1
    avg_per_day = total_spent / days_in_cycle if days_in_cycle else 0

    total_fixed = (
        db.query(func.sum(FixedExpense.amount))
        .filter(FixedExpense.user_id == current_user.id)
        .scalar()
        or 0.0
    )
    savings = monthly_salary - total_spent

    # ── Yearly savings: sum net savings of all past complete billing cycles ────
    earliest_row = (
        db.query(func.min(Expense.date))
        .filter(Expense.user_id == current_user.id)
        .scalar()
    )
    yearly_savings = 0.0
    if earliest_row:
        earliest_date = date.fromisoformat(earliest_row)
        past_cycles = _all_past_complete_cycles(start_day, earliest_date)
        for cs, ce in past_cycles:
            cs_str, ce_str = str(cs), str(ce)
            cycle_expenses = (
                db.query(func.sum(Expense.amount))
                .filter(
                    Expense.user_id == current_user.id,
                    Expense.date >= cs_str,
                    Expense.date <= ce_str,
                )
                .scalar()
                or 0.0
            )
            yearly_savings += monthly_salary - cycle_expenses

    return DashboardSummary(
        current_month=start_str[:7],
        cycle_start=start_str,
        cycle_end=end_str,
        total_spent=total_spent,
        transaction_count=transaction_count,
        avg_per_day=round(avg_per_day, 2),
        monthly_salary=monthly_salary,
        total_fixed=total_fixed,
        savings=savings,
        yearly_savings=round(yearly_savings, 2),
    )


@router.get("/monthly-trend", response_model=list[MonthlySummary])
def monthly_trend(
    months: int = Query(6, ge=1, le=24),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns aggregates for the past N billing cycles."""
    settings = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    start_day = settings.billing_cycle_start_day if settings else 1
    monthly_salary = settings.monthly_salary if settings else 0.0

    result = []
    for cycle_start, cycle_end in _past_billing_cycles(start_day, months):
        start_str, end_str = str(cycle_start), str(cycle_end)
        rows = (
            db.query(Expense)
            .filter(
                Expense.user_id == current_user.id,
                Expense.date >= start_str,
                Expense.date <= end_str,
            )
            .all()
        )
        cycle_total = sum(e.amount for e in rows)
        result.append(
            MonthlySummary(
                month=cycle_start.strftime("%Y-%m"),
                total=cycle_total,
                transaction_count=len(rows),
                salary=monthly_salary,
                savings=monthly_salary - cycle_total,
            )
        )
    return result


@router.get("/category-breakdown", response_model=list[CategoryBreakdown])
def category_breakdown(
    start_date: str | None = Query(None, description="YYYY-MM-DD (defaults to current billing cycle start)"),
    end_date: str | None = Query(None, description="YYYY-MM-DD (defaults to current billing cycle end)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    start_day = settings.billing_cycle_start_day if settings else 1

    if not start_date or not end_date:
        cs, ce = _billing_period(start_day)
        start_date = start_date or str(cs)
        end_date = end_date or str(ce)

    rows = (
        db.query(Category.name, func.sum(Expense.amount).label("total"))
        .join(Expense, Expense.category_id == Category.id)
        .filter(
            Expense.user_id == current_user.id,
            Expense.date >= start_date,
            Expense.date <= end_date,
        )
        .group_by(Category.name)
        .all()
    )
    return [CategoryBreakdown(category=r.name, amount=r.total) for r in rows]


@router.get("/payment-breakdown", response_model=list[PaymentBreakdown])
def payment_breakdown(
    start_date: str | None = Query(None, description="YYYY-MM-DD (defaults to current billing cycle start)"),
    end_date: str | None = Query(None, description="YYYY-MM-DD (defaults to current billing cycle end)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    start_day = settings.billing_cycle_start_day if settings else 1

    if not start_date or not end_date:
        cs, ce = _billing_period(start_day)
        start_date = start_date or str(cs)
        end_date = end_date or str(ce)

    rows = (
        db.query(PaymentMethod.name, func.sum(Expense.amount).label("total"))
        .join(Expense, Expense.payment_method_id == PaymentMethod.id)
        .filter(
            Expense.user_id == current_user.id,
            Expense.date >= start_date,
            Expense.date <= end_date,
        )
        .group_by(PaymentMethod.name)
        .all()
    )
    return [PaymentBreakdown(payment_method=r.name, amount=r.total) for r in rows]

import calendar
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    Category,
    Expense,
    FixedExpense,
    PaymentMethod,
    User,
    UserBillingCycleSettings,
)
from app.schemas import (
    BillingCycleOut,
    CategoryBreakdown,
    DashboardSummary,
    FixedExpenseOut,
    MonthlySummary,
    PaymentBreakdown,
)

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
        # last_day = calendar.monthrange(s.year, s.month if s.month != 12 else 1)[1]
        if s.month == 12:
            e = s.replace(year=s.year + 1, month=1) - timedelta(days=1)
            next_s = s.replace(
                year=s.year + 1, month=1, day=min(start_day, calendar.monthrange(s.year + 1, 1)[1])
            )
        else:
            e = s.replace(month=s.month + 1) - timedelta(days=1)
            next_m = s.month + 1
            next_y = s.year
            next_s = s.replace(
                year=next_y,
                month=next_m,
                day=min(start_day, calendar.monthrange(next_y, next_m)[1]),
            )
        cycles.append((s, e))
        s = next_s
    return cycles


def _get_or_seed_cycle_settings(
    db: Session,
    user_id: int,
    cycle_start: date,
) -> "UserBillingCycleSettings":
    """Return the per-cycle settings row for `cycle_start`, creating it if absent.

    Seed order:
      1. Exact row already exists → return it.
      2. Copy from most recent previous cycle row.
      3. Fall back to hardcoded defaults (salary=0, start_day=1).
    """
    row = (
        db.query(UserBillingCycleSettings)
        .filter(
            UserBillingCycleSettings.user_id == user_id,
            UserBillingCycleSettings.cycle_start == str(cycle_start),
        )
        .first()
    )
    if row:
        return row

    # Copy from the most recent previous cycle
    prev = (
        db.query(UserBillingCycleSettings)
        .filter(
            UserBillingCycleSettings.user_id == user_id,
            UserBillingCycleSettings.cycle_start < str(cycle_start),
        )
        .order_by(UserBillingCycleSettings.cycle_start.desc())
        .first()
    )

    salary = prev.monthly_salary if prev else 0.0
    start_day = prev.billing_cycle_start_day if prev else 1

    new_row = UserBillingCycleSettings(
        user_id=user_id,
        cycle_start=str(cycle_start),
        billing_cycle_start_day=start_day,
        monthly_salary=salary,
    )
    db.add(new_row)
    try:
        db.commit()
    except IntegrityError:
        # Race condition: another request already inserted the same row
        db.rollback()
        return (
            db.query(UserBillingCycleSettings)
            .filter(
                UserBillingCycleSettings.user_id == user_id,
                UserBillingCycleSettings.cycle_start == str(cycle_start),
            )
            .first()
        )
    db.refresh(new_row)
    return new_row


@router.get("/summary", response_model=DashboardSummary)
def get_summary(
    cycle_start: str | None = Query(None, description="YYYY-MM-DD — override billing cycle start"),
    cycle_end: str | None = Query(None, description="YYYY-MM-DD — override billing cycle end"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Determine the cycle window first (need cycle_start_date before fetching settings)
    if cycle_start and cycle_end:
        # caller supplied an explicit window (e.g. a past billing cycle)
        start_str, end_str = cycle_start, cycle_end
        cycle_start_date = date.fromisoformat(cycle_start)
        cycle_end_date = date.fromisoformat(cycle_end)
    else:
        # Bootstrap: use start_day=1 to find today's cycle; the real start_day is in the row
        cycle_start_date, cycle_end_date = _billing_period(1)
        # Refine using the actual start_day once we have the row (seed may update it)
        cs_row = _get_or_seed_cycle_settings(db, current_user.id, cycle_start_date)
        cycle_start_date, cycle_end_date = _billing_period(cs_row.billing_cycle_start_day)
        start_str, end_str = str(cycle_start_date), str(cycle_end_date)

    cs_settings = _get_or_seed_cycle_settings(db, current_user.id, cycle_start_date)
    start_day = cs_settings.billing_cycle_start_day
    monthly_salary = cs_settings.monthly_salary

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

    days_in_cycle = (cycle_end_date - cycle_start_date).days + 1
    avg_per_day = total_spent / days_in_cycle if days_in_cycle else 0

    total_fixed = (
        db.query(func.sum(FixedExpense.amount))
        .filter(FixedExpense.user_id == current_user.id)
        .scalar()
        or 0.0
    )
    # savings of current month is calculated as: salary - total_spent
    savings = monthly_salary - total_spent

    # ── Yearly savings: sum net savings of all past complete billing cycles ────
    earliest_row = (
        db.query(func.min(Expense.date)).filter(Expense.user_id == current_user.id).scalar()
    )
    yearly_savings = 0.0
    if earliest_row:
        earliest_date = date.fromisoformat(earliest_row)
        past_cycles = _all_past_complete_cycles(start_day, earliest_date)
        for cs, ce in past_cycles:
            cs_str, ce_str = str(cs), str(ce)
            past_settings = _get_or_seed_cycle_settings(db, current_user.id, cs)
            past_salary = past_settings.monthly_salary
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
            yearly_savings += past_salary - cycle_expenses

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
    # Derive start_day from the current cycle's settings row
    current_cycle_start, _ = _billing_period(1)
    current_cs_row = _get_or_seed_cycle_settings(db, current_user.id, current_cycle_start)
    start_day = current_cs_row.billing_cycle_start_day
    # Re-derive with the real start_day
    current_cycle_start, _ = _billing_period(start_day)

    result = []
    for cycle_start, cycle_end in _past_billing_cycles(start_day, months):
        start_str, end_str = str(cycle_start), str(cycle_end)
        cycle_settings = _get_or_seed_cycle_settings(db, current_user.id, cycle_start)
        monthly_salary = cycle_settings.monthly_salary
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
    start_date: str | None = Query(
        None, description="YYYY-MM-DD (defaults to current billing cycle start)"
    ),
    end_date: str | None = Query(
        None, description="YYYY-MM-DD (defaults to current billing cycle end)"
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_cycle_start, _ = _billing_period(1)
    cs_row = _get_or_seed_cycle_settings(db, current_user.id, current_cycle_start)
    start_day = cs_row.billing_cycle_start_day

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
    start_date: str | None = Query(
        None, description="YYYY-MM-DD (defaults to current billing cycle start)"
    ),
    end_date: str | None = Query(
        None, description="YYYY-MM-DD (defaults to current billing cycle end)"
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_cycle_start, _ = _billing_period(1)
    cs_row = _get_or_seed_cycle_settings(db, current_user.id, current_cycle_start)
    start_day = cs_row.billing_cycle_start_day

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


@router.get("/billing-cycles", response_model=list[BillingCycleOut])
def list_billing_cycles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return every billing cycle from January 2026 up to and including the current cycle,
    most recent first. Each entry carries start/end dates and an is_current flag.
    """
    current_cycle_start, _ = _billing_period(1)
    cs_row = _get_or_seed_cycle_settings(db, current_user.id, current_cycle_start)
    start_day = cs_row.billing_cycle_start_day

    current_start, current_end = _billing_period(start_day)

    # The earliest cycle is the one whose start falls in Jan 2026
    last_day_jan = calendar.monthrange(2026, 1)[1]
    earliest_start = date(2026, 1, min(start_day, last_day_jan))

    cycles: list[BillingCycleOut] = []
    s = current_start
    while s >= earliest_start:
        # compute end for this cycle
        if s.month == 12:
            e = s.replace(year=s.year + 1, month=1) - timedelta(days=1)
        else:
            e = s.replace(month=s.month + 1) - timedelta(days=1)

        label = f"{s.strftime('%b %Y')} ({s.strftime('%-d %b')} – {e.strftime('%-d %b')})"
        cycles.append(
            BillingCycleOut(
                label=label,
                start_date=str(s),
                end_date=str(e),
                is_current=(s == current_start),
            )
        )

        if s == earliest_start:
            break

        # step back one month
        prev_month = s.month - 1 or 12
        prev_year = s.year if s.month > 1 else s.year - 1
        last_day = calendar.monthrange(prev_year, prev_month)[1]
        s = date(prev_year, prev_month, min(start_day, last_day))

    return cycles


def _cycle_end_from_start(cs: date) -> date:
    """Return the last day of the billing cycle whose start is cs."""
    if cs.month == 12:
        return cs.replace(year=cs.year + 1, month=1) - timedelta(days=1)
    return cs.replace(month=cs.month + 1) - timedelta(days=1)


def _resolve_cycle_window(cycle_start_param: str | None, start_day: int) -> tuple[str, str]:
    """Return (window_start, window_end) as YYYY-MM-DD strings.

    If cycle_start_param is given it is used as the cycle start; otherwise the
    current billing cycle is computed from start_day.
    """
    if cycle_start_param:
        cs = date.fromisoformat(cycle_start_param)
    else:
        cs, _ = _billing_period(start_day)
    ce = _cycle_end_from_start(cs)
    return str(cs), str(ce)


@router.get("/fixed-expenses-status")
def fixed_expenses_status(
    cycle_start: str | None = Query(None, description="YYYY-MM-DD — billing cycle start date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns how many fixed expense templates are eligible and how many already have an
    expense record anywhere within the billing cycle window (regardless of exact date —
    the user may have moved the row to its actual deduction date).
    """
    current_cycle_start, _ = _billing_period(1)
    cs_row = _get_or_seed_cycle_settings(db, current_user.id, current_cycle_start)
    start_day = cs_row.billing_cycle_start_day
    win_start, win_end = _resolve_cycle_window(cycle_start, start_day)

    eligible_ids = [
        fe.id
        for fe in db.query(FixedExpense).filter(FixedExpense.user_id == current_user.id).all()
        if fe.payment_method_id and fe.category_id
    ]
    total_eligible = len(eligible_ids)

    if total_eligible == 0:
        return {"total_eligible": 0, "applied_count": 0, "all_applied": True}

    # Count distinct fixed_expense_id values that appear anywhere in the cycle window
    applied_ids = {
        row.fixed_expense_id
        for row in db.query(Expense.fixed_expense_id)
        .filter(
            Expense.user_id == current_user.id,
            Expense.fixed_expense_id.in_(eligible_ids),
            Expense.date >= win_start,
            Expense.date <= win_end,
        )
        .all()
    }
    applied_count = len(applied_ids)

    return {
        "total_eligible": total_eligible,
        "applied_count": applied_count,
        "all_applied": applied_count >= total_eligible,
    }


@router.post("/apply-fixed-expenses", response_model=list[FixedExpenseOut])
def apply_fixed_expenses(
    cycle_start: str | None = Query(
        None, description="YYYY-MM-DD — billing cycle start date to post on (defaults to current)"
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Idempotently posts fixed expense templates as expense records for the given billing
    cycle.  Dedup checks whether the template already has ANY expense row within the
    cycle window (the user may have changed the date after auto-posting).
    New rows are posted on the 1st of the cycle's calendar month so the user can freely
    edit the date to the actual deduction date without re-triggering apply.
    """
    from app.routers.settings import fe_to_out  # local import avoids circular import

    current_cycle_start, _ = _billing_period(1)
    cs_row = _get_or_seed_cycle_settings(db, current_user.id, current_cycle_start)
    start_day = cs_row.billing_cycle_start_day
    win_start, win_end = _resolve_cycle_window(cycle_start, start_day)

    # Post on the cycle start date so the expense falls within the cycle window.
    # The dedup check queries date >= win_start, so using win_start keeps the
    # posted rows visible in the cycle view and prevents duplicate inserts on
    # repeated calls.
    post_date = win_start

    fixed_expenses = db.query(FixedExpense).filter(FixedExpense.user_id == current_user.id).all()

    for fe in fixed_expenses:
        if not fe.payment_method_id or not fe.category_id:
            continue

        # Dedup: skip if ANY expense with this template ID already exists in the cycle window
        already_in_cycle = (
            db.query(Expense)
            .filter(
                Expense.user_id == current_user.id,
                Expense.fixed_expense_id == fe.id,
                Expense.date >= win_start,
                Expense.date <= win_end,
            )
            .first()
        )
        if already_in_cycle:
            continue

        exp = Expense(
            user_id=current_user.id,
            date=post_date,
            description=fe.description,
            amount=fe.amount,
            payment_method_id=fe.payment_method_id,
            category_id=fe.category_id,
            fixed_expense_id=fe.id,
        )
        db.add(exp)

    db.commit()
    return [fe_to_out(fe) for fe in fixed_expenses]

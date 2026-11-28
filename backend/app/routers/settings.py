from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import (
    Category,
    CategoryBudget,
    Expense,
    FixedExpense,
    PaymentMethod,
    User,
    UserBillingCycleSettings,
)
from app.schemas import (
    BillingCycleSettingsOut,
    BillingCycleSettingsUpdate,
    CategoryBudgetOut,
    CategoryBudgetUpsert,
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    FixedExpenseCreate,
    FixedExpenseOut,
    FixedExpenseUpdate,
    PaymentMethodCreate,
    PaymentMethodOut,
    PaymentMethodUpdate,
)


def fe_to_out(fe: FixedExpense) -> FixedExpenseOut:
    """Shared helper — builds FixedExpenseOut including payment_method_name."""
    return FixedExpenseOut(
        id=fe.id,
        description=fe.description,
        amount=fe.amount,
        category_id=fe.category_id,
        category_name=fe.category.name if fe.category else None,
        payment_method_id=fe.payment_method_id,
        payment_method_name=fe.payment_method.name if fe.payment_method else None,
    )


router = APIRouter(prefix="/settings", tags=["settings"])


# ── Per-Cycle Settings ────────────────────────────────────────────────────────


@router.get("/cycle/{cycle_start}", response_model=BillingCycleSettingsOut)
def get_cycle_settings(
    cycle_start: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the billing-cycle settings for the given cycle_start (YYYY-MM-DD).
    If no row exists yet, seeds it from the most recent previous cycle (or defaults).
    """
    # Import here to avoid circular import — dashboard helper owns the seed logic
    from app.routers.dashboard import _get_or_seed_cycle_settings

    try:
        cycle_date = date.fromisoformat(cycle_start)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="cycle_start must be YYYY-MM-DD") from exc

    return _get_or_seed_cycle_settings(db, current_user.id, cycle_date)


@router.put("/cycle/{cycle_start}", response_model=BillingCycleSettingsOut)
def update_cycle_settings(
    cycle_start: str,
    body: BillingCycleSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update salary and/or start-day for one specific billing cycle only."""
    from app.routers.dashboard import _get_or_seed_cycle_settings

    try:
        cycle_date = date.fromisoformat(cycle_start)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="cycle_start must be YYYY-MM-DD") from exc

    # Ensure the row exists before updating
    row = _get_or_seed_cycle_settings(db, current_user.id, cycle_date)

    if body.billing_cycle_start_day is not None:
        row.billing_cycle_start_day = body.billing_cycle_start_day
    if body.monthly_salary is not None:
        row.monthly_salary = body.monthly_salary

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Conflict updating cycle settings") from exc

    db.refresh(row)
    return row


@router.get("/cycles", response_model=list[BillingCycleSettingsOut])
def list_cycles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all per-cycle settings rows for the current user, most recent first."""
    return (
        db.query(UserBillingCycleSettings)
        .filter(UserBillingCycleSettings.user_id == current_user.id)
        .order_by(UserBillingCycleSettings.cycle_start.desc())
        .all()
    )


@router.delete("/cycle/{cycle_start}", status_code=204)
def delete_cycle(
    cycle_start: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a billing cycle settings row. The current active cycle cannot be deleted."""
    from app.routers.dashboard import _billing_period

    try:
        cycle_date = date.fromisoformat(cycle_start)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="cycle_start must be YYYY-MM-DD") from exc

    # Determine current cycle's start (use start_day=1 as bootstrap; refine below)
    current_start, _ = _billing_period(1)
    # Fetch the row to get its actual start_day for a more precise check
    row = (
        db.query(UserBillingCycleSettings)
        .filter(
            UserBillingCycleSettings.user_id == current_user.id,
            UserBillingCycleSettings.cycle_start == str(cycle_date),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Billing cycle not found")

    # Recompute current cycle with the row's own start_day
    actual_current_start, _ = _billing_period(row.billing_cycle_start_day)
    if str(cycle_date) == str(actual_current_start):
        raise HTTPException(
            status_code=400, detail="Cannot delete the current active billing cycle"
        )

    db.delete(row)
    db.commit()


# ── Categories ────────────────────────────────────────────────────────────────


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (
        db.query(Category).filter(Category.user_id == current_user.id).order_by(Category.name).all()
    )


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(
    body: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if (
        db.query(Category)
        .filter(Category.user_id == current_user.id, Category.name == body.name)
        .first()
    ):
        raise HTTPException(status_code=400, detail="Category already exists")
    cat = Category(user_id=current_user.id, name=body.name)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.put("/categories/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int,
    body: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cat = (
        db.query(Category)
        .filter(Category.id == category_id, Category.user_id == current_user.id)
        .first()
    )
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if (
        db.query(Category)
        .filter(
            Category.user_id == current_user.id,
            Category.name == body.name,
            Category.id != category_id,
        )
        .first()
    ):
        raise HTTPException(status_code=400, detail="Category name already exists")
    cat.name = body.name
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/categories/{category_id}", status_code=204)
def delete_category(
    category_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    cat = (
        db.query(Category)
        .filter(Category.id == category_id, Category.user_id == current_user.id)
        .first()
    )
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(cat)
    db.commit()


# ── Payment Methods ───────────────────────────────────────────────────────────


@router.get("/payment-methods", response_model=list[PaymentMethodOut])
def list_payment_methods(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return (
        db.query(PaymentMethod)
        .filter(PaymentMethod.user_id == current_user.id)
        .order_by(PaymentMethod.name)
        .all()
    )


@router.post("/payment-methods", response_model=PaymentMethodOut, status_code=201)
def create_payment_method(
    body: PaymentMethodCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if (
        db.query(PaymentMethod)
        .filter(PaymentMethod.user_id == current_user.id, PaymentMethod.name == body.name)
        .first()
    ):
        raise HTTPException(status_code=400, detail="Payment method already exists")
    pm = PaymentMethod(user_id=current_user.id, name=body.name)
    db.add(pm)
    db.commit()
    db.refresh(pm)
    return pm


@router.put("/payment-methods/{pm_id}", response_model=PaymentMethodOut)
def update_payment_method(
    pm_id: int,
    body: PaymentMethodUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pm = (
        db.query(PaymentMethod)
        .filter(PaymentMethod.id == pm_id, PaymentMethod.user_id == current_user.id)
        .first()
    )
    if not pm:
        raise HTTPException(status_code=404, detail="Payment method not found")
    if (
        db.query(PaymentMethod)
        .filter(
            PaymentMethod.user_id == current_user.id,
            PaymentMethod.name == body.name,
            PaymentMethod.id != pm_id,
        )
        .first()
    ):
        raise HTTPException(status_code=400, detail="Payment method name already exists")
    pm.name = body.name
    db.commit()
    db.refresh(pm)
    return pm


@router.delete("/payment-methods/{pm_id}", status_code=204)
def delete_payment_method(
    pm_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    pm = (
        db.query(PaymentMethod)
        .filter(PaymentMethod.id == pm_id, PaymentMethod.user_id == current_user.id)
        .first()
    )
    if not pm:
        raise HTTPException(status_code=404, detail="Payment method not found")
    db.delete(pm)
    db.commit()


# ── Fixed Expenses ────────────────────────────────────────────────────────────


@router.get("/fixed-expenses", response_model=list[FixedExpenseOut])
def list_fixed_expenses(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return [
        fe_to_out(fe)
        for fe in db.query(FixedExpense).filter(FixedExpense.user_id == current_user.id).all()
    ]


@router.post("/fixed-expenses", response_model=FixedExpenseOut, status_code=201)
def create_fixed_expense(
    body: FixedExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.category_id:
        cat = (
            db.query(Category)
            .filter(Category.id == body.category_id, Category.user_id == current_user.id)
            .first()
        )
        if not cat:
            raise HTTPException(status_code=404, detail="Category not found")
    if body.payment_method_id:
        pm = (
            db.query(PaymentMethod)
            .filter(
                PaymentMethod.id == body.payment_method_id,
                PaymentMethod.user_id == current_user.id,
            )
            .first()
        )
        if not pm:
            raise HTTPException(status_code=404, detail="Payment method not found")
    fe = FixedExpense(
        user_id=current_user.id,
        description=body.description,
        amount=body.amount,
        category_id=body.category_id,
        payment_method_id=body.payment_method_id,
    )
    db.add(fe)
    db.commit()
    db.refresh(fe)
    return fe_to_out(fe)


@router.put("/fixed-expenses/{fe_id}", response_model=FixedExpenseOut)
def update_fixed_expense(
    fe_id: int,
    body: FixedExpenseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fe = (
        db.query(FixedExpense)
        .filter(FixedExpense.id == fe_id, FixedExpense.user_id == current_user.id)
        .first()
    )
    if not fe:
        raise HTTPException(status_code=404, detail="Fixed expense not found")
    if body.description is not None:
        fe.description = body.description
    if body.amount is not None:
        fe.amount = body.amount
    if body.category_id is not None:
        fe.category_id = body.category_id
    if body.payment_method_id is not None:
        fe.payment_method_id = body.payment_method_id
    db.commit()
    db.refresh(fe)
    return fe_to_out(fe)


@router.delete("/fixed-expenses/{fe_id}", status_code=204)
def delete_fixed_expense(
    fe_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    fe = (
        db.query(FixedExpense)
        .filter(FixedExpense.id == fe_id, FixedExpense.user_id == current_user.id)
        .first()
    )
    if not fe:
        raise HTTPException(status_code=404, detail="Fixed expense not found")
    # Detach the dedup marker from all historical expense rows that referenced this
    # template so they remain intact but no longer point at a deleted template ID.
    (
        db.query(Expense)
        .filter(Expense.user_id == current_user.id, Expense.fixed_expense_id == fe_id)
        .update({"fixed_expense_id": None}, synchronize_session=False)
    )
    db.delete(fe)
    db.commit()


# ── Shared helper (imported by dashboard router) ──────────────────────────────
# (fe_to_out is defined at the top of this module and importable)


# ── Category Budgets ──────────────────────────────────────────────────────────


def _seed_budgets_for_cycle(db: Session, user_id: int, cycle_start_str: str) -> None:
    """Seed CategoryBudget rows for *cycle_start_str* from the most recent previous
    cycle that has at least one budget row (carry-forward).  No-op if rows already
    exist for this cycle.  Wrapped in IntegrityError guard for concurrent safety.
    """
    # No-op if already seeded
    exists = (
        db.query(CategoryBudget)
        .filter(
            CategoryBudget.user_id == user_id,
            CategoryBudget.cycle_start == cycle_start_str,
        )
        .first()
    )
    if exists:
        return

    # Find most recent previous cycle with at least one budget row
    prev = (
        db.query(CategoryBudget.cycle_start)
        .filter(
            CategoryBudget.user_id == user_id,
            CategoryBudget.cycle_start < cycle_start_str,
        )
        .order_by(CategoryBudget.cycle_start.desc())
        .first()
    )

    # Build lookup {category_id: limit_amount} from previous cycle (empty if none)
    prev_limits: dict[int, float] = {}
    if prev:
        prev_rows = (
            db.query(CategoryBudget)
            .filter(
                CategoryBudget.user_id == user_id,
                CategoryBudget.cycle_start == prev.cycle_start,
            )
            .all()
        )
        prev_limits = {r.category_id: r.limit_amount for r in prev_rows}

    categories = db.query(Category).filter(Category.user_id == user_id).all()

    new_rows = [
        CategoryBudget(
            user_id=user_id,
            category_id=cat.id,
            cycle_start=cycle_start_str,
            limit_amount=prev_limits.get(cat.id, 0.0),
        )
        for cat in categories
    ]

    if not new_rows:
        return

    try:
        db.add_all(new_rows)
        db.commit()
    except IntegrityError:
        db.rollback()


@router.get("/budgets/{cycle_start}", response_model=list[CategoryBudgetOut])
def get_budgets(
    cycle_start: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return one CategoryBudgetOut per user category for the given cycle.
    Seeds from the most recent previous cycle on first access (carry-forward).
    """
    try:
        date.fromisoformat(cycle_start)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="cycle_start must be YYYY-MM-DD") from exc

    _seed_budgets_for_cycle(db, current_user.id, cycle_start)

    rows = (
        db.query(Category, CategoryBudget)
        .outerjoin(
            CategoryBudget,
            (CategoryBudget.category_id == Category.id)
            & (CategoryBudget.cycle_start == cycle_start)
            & (CategoryBudget.user_id == current_user.id),
        )
        .filter(Category.user_id == current_user.id)
        .all()
    )

    return [
        CategoryBudgetOut(
            category_id=cat.id,
            cycle_start=cycle_start,
            limit_amount=budget.limit_amount if budget else 0.0,
        )
        for cat, budget in rows
    ]


@router.put("/budgets/{cycle_start}/{category_id}", response_model=CategoryBudgetOut)
def upsert_budget(
    cycle_start: str,
    category_id: int,
    body: CategoryBudgetUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upsert the budget limit for one category in a given billing cycle."""
    try:
        date.fromisoformat(cycle_start)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="cycle_start must be YYYY-MM-DD") from exc

    cat = (
        db.query(Category)
        .filter(Category.id == category_id, Category.user_id == current_user.id)
        .first()
    )
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    row = (
        db.query(CategoryBudget)
        .filter(
            CategoryBudget.user_id == current_user.id,
            CategoryBudget.category_id == category_id,
            CategoryBudget.cycle_start == cycle_start,
        )
        .first()
    )

    if row is None:
        row = CategoryBudget(
            user_id=current_user.id,
            category_id=category_id,
            cycle_start=cycle_start,
            limit_amount=body.limit_amount,
        )
        db.add(row)
    else:
        row.limit_amount = body.limit_amount

    db.commit()
    db.refresh(row)

    return CategoryBudgetOut(
        category_id=row.category_id,
        cycle_start=row.cycle_start,
        limit_amount=row.limit_amount,
    )

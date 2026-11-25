from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Category, Expense, FixedExpense, PaymentMethod, User, UserSettings
from app.schemas import (
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    FixedExpenseCreate,
    FixedExpenseOut,
    FixedExpenseUpdate,
    PaymentMethodCreate,
    PaymentMethodOut,
    PaymentMethodUpdate,
    UserSettingsOut,
    UserSettingsUpdate,
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


# ── General Settings ──────────────────────────────────────────────────────────


@router.get("", response_model=UserSettingsOut)
def get_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    s = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    if not s:
        s = UserSettings(user_id=current_user.id)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


@router.put("", response_model=UserSettingsOut)
def update_settings(
    body: UserSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    s = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    if not s:
        s = UserSettings(user_id=current_user.id)
        db.add(s)
    if body.billing_cycle_start_day is not None:
        s.billing_cycle_start_day = body.billing_cycle_start_day
    if body.monthly_salary is not None:
        s.monthly_salary = body.monthly_salary
    db.commit()
    db.refresh(s)
    return s


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

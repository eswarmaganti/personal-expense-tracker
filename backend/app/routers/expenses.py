import math

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Category, Expense, PaymentMethod, User
from app.schemas import ExpenseCreate, ExpenseOut, ExpensePage, ExpenseUpdate

router = APIRouter(prefix="/expenses", tags=["expenses"])


def _to_out(exp: Expense) -> ExpenseOut:
    return ExpenseOut(
        id=exp.id,
        date=exp.date,
        description=exp.description,
        amount=exp.amount,
        payment_method_id=exp.payment_method_id,
        payment_method_name=exp.payment_method.name,
        category_id=exp.category_id,
        category_name=exp.category.name,
        created_at=exp.created_at,
    )


def _get_expense_or_404(expense_id: int, user_id: int, db: Session) -> Expense:
    exp = db.query(Expense).filter(Expense.id == expense_id, Expense.user_id == user_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Expense not found")
    return exp


@router.get("", response_model=ExpensePage)
def list_expenses(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    start_date: str | None = Query(None, description="YYYY-MM-DD"),
    end_date: str | None = Query(None, description="YYYY-MM-DD"),
    category_id: int | None = None,
    payment_method_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Expense).filter(Expense.user_id == current_user.id)
    if start_date:
        q = q.filter(Expense.date >= start_date)
    if end_date:
        q = q.filter(Expense.date <= end_date)
    if category_id:
        q = q.filter(Expense.category_id == category_id)
    if payment_method_id:
        q = q.filter(Expense.payment_method_id == payment_method_id)

    total = q.count()
    items = q.order_by(Expense.date.desc()).offset((page - 1) * page_size).limit(page_size).all()

    return ExpensePage(
        items=[_to_out(e) for e in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
    )


@router.post("", response_model=ExpenseOut, status_code=201)
def create_expense(
    body: ExpenseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # validate FK ownership
    cat = (
        db.query(Category)
        .filter(Category.id == body.category_id, Category.user_id == current_user.id)
        .first()
    )
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    pm = (
        db.query(PaymentMethod)
        .filter(
            PaymentMethod.id == body.payment_method_id, PaymentMethod.user_id == current_user.id
        )
        .first()
    )
    if not pm:
        raise HTTPException(status_code=404, detail="Payment method not found")

    exp = Expense(
        user_id=current_user.id,
        date=str(body.date),
        description=body.description,
        amount=body.amount,
        payment_method_id=body.payment_method_id,
        category_id=body.category_id,
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return _to_out(exp)


@router.get("/{expense_id}", response_model=ExpenseOut)
def get_expense(
    expense_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return _to_out(_get_expense_or_404(expense_id, current_user.id, db))


@router.put("/{expense_id}", response_model=ExpenseOut)
def update_expense(
    expense_id: int,
    body: ExpenseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    exp = _get_expense_or_404(expense_id, current_user.id, db)

    if body.category_id is not None:
        cat = (
            db.query(Category)
            .filter(Category.id == body.category_id, Category.user_id == current_user.id)
            .first()
        )
        if not cat:
            raise HTTPException(status_code=404, detail="Category not found")
        exp.category_id = body.category_id

    if body.payment_method_id is not None:
        pm = (
            db.query(PaymentMethod)
            .filter(
                PaymentMethod.id == body.payment_method_id, PaymentMethod.user_id == current_user.id
            )
            .first()
        )
        if not pm:
            raise HTTPException(status_code=404, detail="Payment method not found")
        exp.payment_method_id = body.payment_method_id

    if body.date is not None:
        exp.date = str(body.date)
    if body.description is not None:
        exp.description = body.description
    if body.amount is not None:
        exp.amount = body.amount

    db.commit()
    db.refresh(exp)
    return _to_out(exp)


@router.delete("/{expense_id}", status_code=204)
def delete_expense(
    expense_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    exp = _get_expense_or_404(expense_id, current_user.id, db)
    db.delete(exp)
    db.commit()

from datetime import UTC, datetime

from sqlalchemy import Column, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


def _now() -> str:
    return datetime.now(UTC).isoformat()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(String, default=_now)
    updated_at = Column(String, default=_now, onupdate=_now)

    categories = relationship("Category", back_populates="user", cascade="all, delete-orphan")
    payment_methods = relationship(
        "PaymentMethod", back_populates="user", cascade="all, delete-orphan"
    )
    expenses = relationship("Expense", back_populates="user", cascade="all, delete-orphan")
    billing_cycle_settings = relationship(
        "UserBillingCycleSettings", back_populates="user", cascade="all, delete-orphan"
    )
    fixed_expenses = relationship(
        "FixedExpense", back_populates="user", cascade="all, delete-orphan"
    )
    category_budgets = relationship(
        "CategoryBudget", back_populates="user", cascade="all, delete-orphan"
    )


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_category_user_name"),)

    user = relationship("User", back_populates="categories")
    expenses = relationship("Expense", back_populates="category")
    fixed_expenses = relationship("FixedExpense", back_populates="category")


class PaymentMethod(Base):
    __tablename__ = "payment_methods"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_payment_method_user_name"),)

    user = relationship("User", back_populates="payment_methods")
    expenses = relationship("Expense", back_populates="payment_method")


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    date = Column(String, nullable=False, index=True)  # YYYY-MM-DD
    description = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    payment_method_id = Column(Integer, ForeignKey("payment_methods.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    # Plain integer — intentionally NOT a FK so that editing/deleting a fixed-expense
    # template never touches historical posted expense rows.  Used only for dedup.
    fixed_expense_id = Column(Integer, nullable=True)
    created_at = Column(String, default=_now)

    user = relationship("User", back_populates="expenses")
    category = relationship("Category", back_populates="expenses")
    payment_method = relationship("PaymentMethod", back_populates="expenses")


class UserBillingCycleSettings(Base):
    """Per-billing-cycle snapshot of salary and start-day for a user.

    One row per (user_id, cycle_start). New cycles are auto-seeded from the
    most recent previous row when the dashboard is first loaded.
    """

    __tablename__ = "user_billing_cycle_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    cycle_start = Column(String, nullable=False, index=True)  # YYYY-MM-DD
    billing_cycle_start_day = Column(Integer, nullable=False, default=1)  # 1–28
    monthly_salary = Column(Float, nullable=False, default=0.0)
    created_at = Column(String, default=_now)
    updated_at = Column(String, default=_now, onupdate=_now)

    __table_args__ = (UniqueConstraint("user_id", "cycle_start", name="uq_ubcs_user_cycle"),)

    user = relationship("User", back_populates="billing_cycle_settings")


class CategoryBudget(Base):
    """Per-billing-cycle spending limit for a user's category.

    One row per (user_id, category_id, cycle_start). Carry-forward seeding
    happens in the settings router when a cycle is first viewed.
    """

    __tablename__ = "category_budgets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    cycle_start = Column(String, nullable=False, index=True)  # YYYY-MM-DD
    limit_amount = Column(Float, nullable=False, default=0.0)

    __table_args__ = (
        UniqueConstraint("user_id", "category_id", "cycle_start", name="uq_cb_user_cat_cycle"),
    )

    user = relationship("User", back_populates="category_budgets")


class FixedExpense(Base):
    __tablename__ = "fixed_expenses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    description = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    payment_method_id = Column(Integer, ForeignKey("payment_methods.id"), nullable=True)

    user = relationship("User", back_populates="fixed_expenses")
    category = relationship("Category", back_populates="fixed_expenses")
    payment_method = relationship("PaymentMethod")
    # No back-ref to Expense — the link is intentionally one-directional (dedup only).

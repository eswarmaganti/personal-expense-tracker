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
    settings = relationship(
        "UserSettings", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    fixed_expenses = relationship(
        "FixedExpense", back_populates="user", cascade="all, delete-orphan"
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


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    billing_cycle_start_day = Column(Integer, default=12)  # 1–28, default 12th
    monthly_salary = Column(Float, default=0.0)

    user = relationship("User", back_populates="settings")


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

from datetime import date as Date

from pydantic import BaseModel, EmailStr, Field

# ── Auth ──────────────────────────────────────────────────────────────────────


class UserRegister(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6)


class UserLogin(BaseModel):
    email: str  # accepts email address or username (name field)
    password: str


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    created_at: str

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UpdateProfile(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    email: EmailStr | None = None


class ChangePassword(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6)


# ── Categories ────────────────────────────────────────────────────────────────


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class CategoryUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class CategoryOut(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


# ── Payment Methods ───────────────────────────────────────────────────────────


class PaymentMethodCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)


class PaymentMethodUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)


class PaymentMethodOut(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


# ── Expenses ──────────────────────────────────────────────────────────────────


class ExpenseCreate(BaseModel):
    date: Date
    description: str = Field(..., min_length=1)
    amount: float = Field(..., gt=0)
    payment_method_id: int
    category_id: int


class ExpenseUpdate(BaseModel):
    date: Date | None = None
    description: str | None = Field(None, min_length=1)
    amount: float | None = Field(None, gt=0)
    payment_method_id: int | None = None
    category_id: int | None = None


class ExpenseOut(BaseModel):
    id: int
    date: str
    description: str
    amount: float
    payment_method_id: int
    payment_method_name: str
    category_id: int
    category_name: str
    fixed_expense_id: int | None = None  # non-null = auto-posted from a fixed expense template
    is_fixed: bool = False  # convenience flag for the frontend
    created_at: str

    model_config = {"from_attributes": True}


class ExpensePage(BaseModel):
    items: list[ExpenseOut]
    total: int
    total_amount: float
    page: int
    page_size: int
    total_pages: int


# ── Billing Cycle Settings ────────────────────────────────────────────────────


class BillingCycleSettingsUpdate(BaseModel):
    billing_cycle_start_day: int | None = Field(None, ge=1, le=28)
    monthly_salary: float | None = Field(None, ge=0)


class BillingCycleSettingsOut(BaseModel):
    cycle_start: str  # YYYY-MM-DD
    billing_cycle_start_day: int
    monthly_salary: float

    model_config = {"from_attributes": True}


# ── Fixed Expenses ────────────────────────────────────────────────────────────


class FixedExpenseCreate(BaseModel):
    description: str = Field(..., min_length=1)
    amount: float = Field(..., gt=0)
    category_id: int | None = None
    payment_method_id: int | None = None


class FixedExpenseUpdate(BaseModel):
    description: str | None = Field(None, min_length=1)
    amount: float | None = Field(None, gt=0)
    category_id: int | None = None
    payment_method_id: int | None = None


class FixedExpenseOut(BaseModel):
    id: int
    description: str
    amount: float
    category_id: int | None
    category_name: str | None
    payment_method_id: int | None = None
    payment_method_name: str | None = None

    model_config = {"from_attributes": True}


# ── Dashboard ─────────────────────────────────────────────────────────────────


class MonthlySummary(BaseModel):
    month: str  # YYYY-MM
    total: float
    transaction_count: int
    salary: float  # monthly_salary from user settings for this cycle
    savings: float  # salary - total_expenses - total_fixed for this cycle


class CategoryBreakdown(BaseModel):
    category: str
    amount: float


class PaymentBreakdown(BaseModel):
    payment_method: str
    amount: float


class DashboardSummary(BaseModel):
    current_month: str
    cycle_start: str  # YYYY-MM-DD — billing cycle start date
    cycle_end: str  # YYYY-MM-DD — billing cycle end date
    total_spent: float
    transaction_count: int
    avg_per_day: float
    monthly_salary: float
    total_fixed: float
    savings: float
    yearly_savings: float  # sum of net savings across all past complete billing cycles


class BillingCycleOut(BaseModel):
    label: str  # e.g. "Nov 2026 (12 Nov – 11 Dec)"
    start_date: str  # YYYY-MM-DD
    end_date: str  # YYYY-MM-DD
    is_current: bool

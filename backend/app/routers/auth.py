from fastapi import APIRouter, Depends, HTTPException
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
)
from app.models import User, UserBillingCycleSettings
from app.schemas import (
    ChangePassword,
    RefreshRequest,
    TokenResponse,
    UpdateProfile,
    UserLogin,
    UserOut,
    UserRegister,
)

router = APIRouter(prefix="/auth", tags=["auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: UserRegister, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        name=body.name,
        email=body.email,
        password_hash=pwd_context.hash(body.password),
    )
    db.add(user)
    db.flush()
    # Seed the first billing cycle settings row with defaults
    from app.routers.dashboard import _billing_period

    first_cycle_start, _ = _billing_period(1)  # start_day=1 as initial default
    db.add(
        UserBillingCycleSettings(
            user_id=user.id,
            cycle_start=str(first_cycle_start),
            billing_cycle_start_day=1,
            monthly_salary=0.0,
        )
    )
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(body: UserLogin, db: Session = Depends(get_db)):
    # Allow login with either email address or display name
    user = db.query(User).filter((User.email == body.email) | (User.name == body.email)).first()
    if not user or not pwd_context.verify(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)):
    user_id = decode_token(body.refresh_token, token_type="refresh")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserOut)
def update_me(
    body: UpdateProfile,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.email and body.email != current_user.email:
        if db.query(User).filter(User.email == body.email).first():
            raise HTTPException(status_code=400, detail="Email already in use")
        current_user.email = body.email
    if body.name:
        current_user.name = body.name
    db.commit()
    db.refresh(current_user)
    return current_user


@router.put("/me/password", status_code=204)
def change_password(
    body: ChangePassword,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not pwd_context.verify(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.password_hash = pwd_context.hash(body.new_password)
    db.commit()

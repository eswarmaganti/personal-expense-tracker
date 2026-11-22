"""
Seed script: creates the admin user if they don't already exist.
Run from the backend/ directory with the venv active:

    python seed_admin.py
"""
from passlib.context import CryptContext

from app.database import Base, SessionLocal, engine
from app.models import User, UserSettings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ADMIN_NAME = "Admin"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin"

Base.metadata.create_all(bind=engine)

db = SessionLocal()
try:
    existing = db.query(User).filter(User.email == ADMIN_EMAIL).first()
    if existing:
        print(f"Admin user already exists (id={existing.id}, email={existing.email})")
    else:
        user = User(
            name=ADMIN_NAME,
            email=ADMIN_EMAIL,
            password_hash=pwd_context.hash(ADMIN_PASSWORD),
        )
        db.add(user)
        db.flush()
        db.add(UserSettings(user_id=user.id))
        db.commit()
        db.refresh(user)
        print(f"✅  Admin user created  →  id={user.id}  email={user.email}  password=admin")
finally:
    db.close()

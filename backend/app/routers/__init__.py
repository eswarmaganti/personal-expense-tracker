from app.routers.auth import router as auth_router
from app.routers.dashboard import router as dashboard_router
from app.routers.expenses import router as expenses_router
from app.routers.settings import router as settings_router

__all__ = ["auth_router", "expenses_router", "dashboard_router", "settings_router"]

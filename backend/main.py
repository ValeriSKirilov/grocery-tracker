import models
import routes
from config import settings
from database import engine
from fastapi import FastAPI, Request
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Grocery Price Tracker API", version="1.0.0")

frontend_url = settings.FRONTEND_URL.strip()
if frontend_url.startswith("^") or frontend_url.endswith("$"):
    cors_origins = {"allow_origin_regex": frontend_url}
else:
    # Also allow a comma-separated list of exact origins.
    cors_origins = {
        "allow_origins": [
            origin.strip() for origin in frontend_url.split(",") if origin.strip()
        ]
    }

app.add_middleware(
    CORSMiddleware,
    **cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    print(f"CRITICAL SYSTEM FAILURE: {exc}")

    return JSONResponse(status_code=500, content={"message": "Internal server error"})


app.include_router(routes.router)


@app.get("/")
def health_check():
    return {"status": "ok", "message": "API is running"}

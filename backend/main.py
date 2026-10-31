import models
from config import settings
from database import engine
from fastapi import FastAPI, Request
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Grocery Price Tracker API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.FRONTEND_URL,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    print(f"CRITICAL SYSTEM FAILURE: {exc}")

    return JSONResponse(status_code=500, content={"message": "Internal server error"})


# TODO UNCOMMENT WHEN ROUTERS ARE IMPLEMENTED
# app.include_router(routes.router)


@app.get("/")
def health_check():
    return {"status": "ok", "message": "API is running"}

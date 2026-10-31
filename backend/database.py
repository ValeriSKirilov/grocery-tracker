from config import settings
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, sessionmaker

database_url = make_url(settings.DATABASE_URL)

if database_url.drivername == "postgresql":
    database_url = database_url.set(drivername="postgresql+psycopg2")

engine = create_engine(database_url)


SessionLocal = sessionmaker(autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

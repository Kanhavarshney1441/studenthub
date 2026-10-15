"""FastAPI endpoints for managing student records."""
from datetime import date
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import Base, engine, get_db
from app.models import Student
from app.schemas import StudentCreate, StudentRead, StudentUpdate

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Students Database CRUD API",
    description=(
        "An internship assignment project using FastAPI and SQLite. "
        "Use the endpoints to create, list, filter, view, update, and delete student records. "
        "Only dummy/demo student data should be used."
    ),
    version="1.0.0",
)

DbSession = Annotated[Session, Depends(get_db)]

STATIC_DIR = __import__("pathlib").Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
def dashboard() -> FileResponse:
    """Serve the interactive student management dashboard."""
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health", tags=["General"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/students", response_model=StudentRead, status_code=status.HTTP_201_CREATED, tags=["Students"])
def create_student(payload: StudentCreate, db: DbSession) -> Student:
    """Create one student record."""
    student = Student(**payload.model_dump())
    db.add(student)
    try:
        db.commit()
        db.refresh(student)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A student with this email already exists.",
        ) from exc
    return student


@app.get("/students", response_model=list[StudentRead], tags=["Students"])
def list_students(
    db: DbSession,
    name: str | None = Query(default=None, min_length=1, description="Case-insensitive name search"),
    course: str | None = Query(default=None, min_length=1, description="Case-insensitive course search"),
    born_after: date | None = Query(default=None, description="Return students born on/after this date (YYYY-MM-DD)"),
    born_before: date | None = Query(default=None, description="Return students born on/before this date (YYYY-MM-DD)"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[Student]:
    """List student records with optional filters and pagination."""
    if born_after and born_before and born_after > born_before:
        raise HTTPException(status_code=400, detail="born_after cannot be later than born_before")

    statement = select(Student)
    if name:
        statement = statement.where(Student.name.ilike(f"%{name.strip()}%"))
    if course:
        statement = statement.where(Student.course.ilike(f"%{course.strip()}%"))
    if born_after:
        statement = statement.where(Student.date_of_birth >= born_after)
    if born_before:
        statement = statement.where(Student.date_of_birth <= born_before)

    statement = statement.order_by(Student.id).offset(offset).limit(limit)
    return list(db.scalars(statement).all())


@app.get("/students/{student_id}", response_model=StudentRead, tags=["Students"])
def get_student(student_id: int, db: DbSession) -> Student:
    """Retrieve a student by unique ID."""
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    return student


@app.patch("/students/{student_id}", response_model=StudentRead, tags=["Students"])
def update_student(student_id: int, payload: StudentUpdate, db: DbSession) -> Student:
    """Update only the fields provided in the request body."""
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="Provide at least one field to update")

    final_email = changes.get("email", student.email)
    final_phone = changes.get("phone", student.phone)
    if final_email is None and final_phone is None:
        raise HTTPException(status_code=422, detail="A student must have at least one contact field: email or phone")

    for field, value in changes.items():
        setattr(student, field, value)

    try:
        db.commit()
        db.refresh(student)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A student with this email already exists.",
        ) from exc
    return student


@app.delete("/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["Students"])
def delete_student(student_id: int, db: DbSession) -> Response:
    """Delete a student record by ID."""
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found")
    db.delete(student)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

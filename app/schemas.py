"""Request and response schemas used for validation."""
from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

PhoneNumber = Annotated[str, Field(min_length=7, max_length=20, pattern=r"^[0-9+() -]+$")]


class StudentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100, examples=["Aarav Sharma"])
    date_of_birth: date = Field(examples=["2005-04-18"])
    email: EmailStr | None = Field(default=None, examples=["aarav@example.com"])
    phone: PhoneNumber | None = Field(default=None, examples=["+91 9876543210"])
    course: str | None = Field(default=None, max_length=100, examples=["B.Tech CSE"])
    address: str | None = Field(default=None, max_length=300, examples=["New Delhi, India"])
    enrollment_date: date = Field(default_factory=date.today, examples=["2026-08-01"])

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Name cannot be blank")
        return value

    @model_validator(mode="after")
    def validate_student_details(self) -> "StudentCreate":
        if self.email is None and self.phone is None:
            raise ValueError("Provide at least one contact field: email or phone")
        if self.date_of_birth > date.today():
            raise ValueError("Date of birth cannot be in the future")
        return self


class StudentUpdate(BaseModel):
    """All fields are optional so clients can update only changed values."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    date_of_birth: date | None = None
    email: EmailStr | None = None
    phone: PhoneNumber | None = None
    course: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=300)
    enrollment_date: date | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Name cannot be blank")
        return value

    @field_validator("date_of_birth")
    @classmethod
    def validate_dob(cls, value: date | None) -> date | None:
        if value is not None and value > date.today():
            raise ValueError("Date of birth cannot be in the future")
        return value


class StudentRead(BaseModel):
    id: int
    name: str
    date_of_birth: date
    email: EmailStr | None
    phone: str | None
    course: str | None
    address: str | None
    enrollment_date: date

    model_config = ConfigDict(from_attributes=True)

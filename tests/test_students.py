from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=test_engine)

    def override_get_db() -> Generator[Session, None, None]:
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)
    test_engine.dispose()


def sample_student() -> dict[str, str]:
    return {
        "name": "Aarav Sharma",
        "date_of_birth": "2005-04-18",
        "email": "aarav@example.com",
        "phone": "+91 9876543210",
        "course": "B.Tech CSE",
        "address": "New Delhi, India",
        "enrollment_date": "2026-08-01",
    }


def test_create_read_update_delete_student(client: TestClient) -> None:
    created_response = client.post("/students", json=sample_student())
    assert created_response.status_code == 201
    created = created_response.json()
    student_id = created["id"]
    assert created["name"] == "Aarav Sharma"

    assert client.get(f"/students/{student_id}").status_code == 200
    assert len(client.get("/students").json()) == 1

    update_response = client.patch(f"/students/{student_id}", json={"course": "AI & Data Science"})
    assert update_response.status_code == 200
    assert update_response.json()["course"] == "AI & Data Science"

    assert client.delete(f"/students/{student_id}").status_code == 204
    assert client.get(f"/students/{student_id}").status_code == 404


def test_contact_information_is_required(client: TestClient) -> None:
    data = sample_student()
    data.pop("email")
    data.pop("phone")
    response = client.post("/students", json=data)
    assert response.status_code == 422


def test_filter_by_name(client: TestClient) -> None:
    client.post("/students", json=sample_student())
    response = client.get("/students", params={"name": "aarav"})
    assert response.status_code == 200
    assert len(response.json()) == 1

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "message": "API is running"}


def test_meta_init_endpoint():
    response = client.get("/api/v1/meta/init")
    assert response.status_code == 200

    data = response.json()
    assert "settlements" in data
    assert "categories" in data
    assert "chains" in data

    # Verify the database returned actual lists
    assert isinstance(data["settlements"], list)
    assert isinstance(data["categories"], list)
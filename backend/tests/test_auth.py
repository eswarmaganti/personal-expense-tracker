"""Auth endpoint tests."""


def test_health(client):
    res = client.get("/")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_register_success(client):
    res = client.post(
        "/api/v1/auth/register",
        json={
            "name": "Alice",
            "email": "alice@example.com",
            "password": "password123",
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["email"] == "alice@example.com"
    assert "id" in data


def test_register_duplicate_email(client, registered_user):
    res = client.post(
        "/api/v1/auth/register",
        json={
            "name": "Dupe",
            "email": registered_user["email"],
            "password": "password123",
        },
    )
    assert res.status_code == 400


def test_login_success(client, registered_user):
    res = client.post(
        "/api/v1/auth/login",
        json={
            "email": registered_user["email"],
            "password": registered_user["password"],
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


def test_login_wrong_password(client, registered_user):
    res = client.post(
        "/api/v1/auth/login",
        json={
            "email": registered_user["email"],
            "password": "wrongpassword",
        },
    )
    assert res.status_code == 401


def test_get_me(client, auth_headers):
    res = client.get("/api/v1/auth/me", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["email"] == "test@example.com"


def test_get_me_unauthenticated(client):
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 403

"""Expense CRUD tests."""


def _seed_category_and_pm(client, auth_headers):
    cat = client.post(
        "/api/v1/settings/categories", json={"name": "Food"}, headers=auth_headers
    ).json()
    pm = client.post(
        "/api/v1/settings/payment-methods", json={"name": "Cash"}, headers=auth_headers
    ).json()
    return cat["id"], pm["id"]


def test_create_expense(client, auth_headers):
    cat_id, pm_id = _seed_category_and_pm(client, auth_headers)
    res = client.post(
        "/api/v1/expenses",
        json={
            "date": "2026-11-01",
            "description": "Lunch",
            "amount": 250.0,
            "category_id": cat_id,
            "payment_method_id": pm_id,
        },
        headers=auth_headers,
    )
    assert res.status_code == 201
    data = res.json()
    assert data["description"] == "Lunch"
    assert data["amount"] == 250.0
    assert data["category_name"] == "Food"
    assert data["payment_method_name"] == "Cash"


def test_list_expenses(client, auth_headers):
    cat_id, pm_id = _seed_category_and_pm(client, auth_headers)
    for i in range(3):
        client.post(
            "/api/v1/expenses",
            json={
                "date": "2026-11-01",
                "description": f"Item {i}",
                "amount": 100.0 * (i + 1),
                "category_id": cat_id,
                "payment_method_id": pm_id,
            },
            headers=auth_headers,
        )

    res = client.get("/api/v1/expenses", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 3
    assert isinstance(data["items"], list)


def test_update_expense(client, auth_headers):
    cat_id, pm_id = _seed_category_and_pm(client, auth_headers)
    create_res = client.post(
        "/api/v1/expenses",
        json={
            "date": "2026-11-01",
            "description": "Original",
            "amount": 500.0,
            "category_id": cat_id,
            "payment_method_id": pm_id,
        },
        headers=auth_headers,
    )
    exp_id = create_res.json()["id"]

    res = client.put(
        f"/api/v1/expenses/{exp_id}",
        json={"description": "Updated", "amount": 600.0},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.json()["description"] == "Updated"
    assert res.json()["amount"] == 600.0


def test_delete_expense(client, auth_headers):
    cat_id, pm_id = _seed_category_and_pm(client, auth_headers)
    create_res = client.post(
        "/api/v1/expenses",
        json={
            "date": "2026-11-01",
            "description": "To delete",
            "amount": 100.0,
            "category_id": cat_id,
            "payment_method_id": pm_id,
        },
        headers=auth_headers,
    )
    exp_id = create_res.json()["id"]

    res = client.delete(f"/api/v1/expenses/{exp_id}", headers=auth_headers)
    assert res.status_code == 204

    res = client.get(f"/api/v1/expenses/{exp_id}", headers=auth_headers)
    assert res.status_code == 404

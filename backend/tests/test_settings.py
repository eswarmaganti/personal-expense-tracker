"""Settings endpoint tests."""


def test_list_categories_empty(client, auth_headers):
    res = client.get("/api/v1/settings/categories", headers=auth_headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_create_and_delete_category(client, auth_headers):
    res = client.post(
        "/api/v1/settings/categories", json={"name": "Transport"}, headers=auth_headers
    )
    assert res.status_code == 201
    cat_id = res.json()["id"]

    del_res = client.delete(f"/api/v1/settings/categories/{cat_id}", headers=auth_headers)
    assert del_res.status_code == 204


def test_duplicate_category(client, auth_headers):
    client.post("/api/v1/settings/categories", json={"name": "Utilities"}, headers=auth_headers)
    res = client.post(
        "/api/v1/settings/categories", json={"name": "Utilities"}, headers=auth_headers
    )
    assert res.status_code == 400


def test_create_payment_method(client, auth_headers):
    res = client.post(
        "/api/v1/settings/payment-methods", json={"name": "Visa"}, headers=auth_headers
    )
    assert res.status_code == 201
    assert res.json()["name"] == "Visa"


def test_get_and_update_cycle_settings(client, auth_headers):
    from datetime import date

    # Use the current cycle start (start_day=1 is the default for a new user)
    today = date.today()
    cycle_start = today.replace(day=1).isoformat()

    res = client.get(f"/api/v1/settings/cycle/{cycle_start}", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert "billing_cycle_start_day" in data
    assert "monthly_salary" in data
    assert data["cycle_start"] == cycle_start

    update_res = client.put(
        f"/api/v1/settings/cycle/{cycle_start}",
        json={
            "billing_cycle_start_day": 15,
            "monthly_salary": 50000.0,
        },
        headers=auth_headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["billing_cycle_start_day"] == 15
    assert update_res.json()["monthly_salary"] == 50000.0

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


def test_get_and_update_settings(client, auth_headers):
    res = client.get("/api/v1/settings", headers=auth_headers)
    assert res.status_code == 200
    assert "billing_cycle_start_day" in res.json()

    update_res = client.put(
        "/api/v1/settings",
        json={
            "billing_cycle_start_day": 15,
            "monthly_salary": 50000.0,
        },
        headers=auth_headers,
    )
    assert update_res.status_code == 200
    assert update_res.json()["billing_cycle_start_day"] == 15
    assert update_res.json()["monthly_salary"] == 50000.0

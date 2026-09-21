import uuid


def make_task(client, auth, **fields):
    payload = {"title": "Write the report", **fields}
    res = client.post("/tasks/", json=payload, headers=auth)
    assert res.status_code == 201, res.text
    return res.json()


class TestTaskCrud:
    def test_list_is_empty_for_a_new_user(self, client, auth):
        res = client.get("/tasks/", headers=auth)
        assert res.status_code == 200
        assert res.json() == []

    def test_create_round_trips(self, client, auth):
        task = make_task(client, auth, priority="high", tags="work, urgent")
        assert task["title"] == "Write the report"
        assert task["priority"] == "high"
        assert task["completed"] is False
        assert task["is_focus"] is False

    def test_patch_is_partial(self, client, auth):
        task = make_task(client, auth, description="keep me")
        res = client.patch(
            f"/tasks/{task['id']}", json={"completed": True}, headers=auth
        )
        assert res.status_code == 200
        assert res.json()["completed"] is True
        # Untouched fields survive an exclude_unset patch.
        assert res.json()["description"] == "keep me"

    def test_focus_flag_persists(self, client, auth):
        """The column whose absence broke the app."""
        task = make_task(client, auth)
        res = client.patch(f"/tasks/{task['id']}", json={"is_focus": True}, headers=auth)
        assert res.status_code == 200
        assert res.json()["is_focus"] is True
        assert client.get("/tasks/", headers=auth).json()[0]["is_focus"] is True

    def test_completed_filter(self, client, auth):
        open_task = make_task(client, auth)
        done = make_task(client, auth, title="Done thing")
        client.patch(f"/tasks/{done['id']}", json={"completed": True}, headers=auth)

        only_open = client.get("/tasks/?completed=false", headers=auth).json()
        assert [t["id"] for t in only_open] == [open_task["id"]]

    def test_delete(self, client, auth):
        task = make_task(client, auth)
        assert client.delete(f"/tasks/{task['id']}", headers=auth).status_code == 204
        assert client.get(f"/tasks/{task['id']}", headers=auth).status_code == 404


class TestOwnership:
    def test_other_users_task_is_404_not_403(self, client, auth, other_auth):
        """404 rather than 403 so the existence of other users' tasks never leaks."""
        task = make_task(client, auth)
        assert client.get(f"/tasks/{task['id']}", headers=other_auth).status_code == 404
        assert (
            client.patch(
                f"/tasks/{task['id']}", json={"title": "hijacked"}, headers=other_auth
            ).status_code
            == 404
        )
        assert (
            client.delete(f"/tasks/{task['id']}", headers=other_auth).status_code == 404
        )

    def test_list_is_scoped_to_the_caller(self, client, auth, other_auth):
        make_task(client, auth)
        make_task(client, other_auth, title="Not yours")
        assert len(client.get("/tasks/", headers=auth).json()) == 1

    def test_auth_is_required(self, client):
        assert client.get("/tasks/").status_code == 401


class TestBulk:
    def test_complete_and_reopen(self, client, auth):
        ids = [make_task(client, auth, title=f"T{i}")["id"] for i in range(3)]

        res = client.post(
            "/tasks/bulk", json={"ids": ids, "action": "complete"}, headers=auth
        )
        assert res.status_code == 200
        assert res.json()["affected"] == 3
        assert all(t["completed"] for t in client.get("/tasks/", headers=auth).json())

        client.post(
            "/tasks/bulk", json={"ids": ids, "action": "uncomplete"}, headers=auth
        )
        assert not any(t["completed"] for t in client.get("/tasks/", headers=auth).json())

    def test_delete(self, client, auth):
        ids = [make_task(client, auth, title=f"T{i}")["id"] for i in range(2)]
        res = client.post(
            "/tasks/bulk", json={"ids": ids, "action": "delete"}, headers=auth
        )
        assert res.json()["affected"] == 2
        assert client.get("/tasks/", headers=auth).json() == []

    def test_cannot_touch_another_users_tasks(self, client, auth, other_auth):
        victim = make_task(client, other_auth, title="Theirs")

        res = client.post(
            "/tasks/bulk", json={"ids": [victim["id"]], "action": "delete"}, headers=auth
        )
        # Skipped silently rather than 404'd -- a per-id 404 would be an
        # enumeration oracle for other users' task ids.
        assert res.status_code == 200
        assert res.json()["affected"] == 0
        assert client.get(f"/tasks/{victim['id']}", headers=other_auth).status_code == 200

    def test_unknown_ids_are_skipped(self, client, auth):
        task = make_task(client, auth)
        res = client.post(
            "/tasks/bulk",
            json={"ids": [task["id"], str(uuid.uuid4())], "action": "complete"},
            headers=auth,
        )
        assert res.json()["affected"] == 1

    def test_bulk_path_is_not_parsed_as_a_task_id(self, client, auth):
        """POST /tasks/bulk must not fall through to a /{task_id} route."""
        res = client.post(
            "/tasks/bulk", json={"ids": [str(uuid.uuid4())], "action": "complete"},
            headers=auth,
        )
        assert res.status_code == 200

    def test_validation(self, client, auth):
        assert (
            client.post(
                "/tasks/bulk", json={"ids": [], "action": "complete"}, headers=auth
            ).status_code
            == 422
        )
        assert (
            client.post(
                "/tasks/bulk",
                json={"ids": [str(uuid.uuid4())], "action": "explode"},
                headers=auth,
            ).status_code
            == 422
        )

    def test_updated_at_advances(self, client, auth):
        """A Core UPDATE bypasses the ORM's onupdate, so the route sets it."""
        task = make_task(client, auth)
        client.post(
            "/tasks/bulk", json={"ids": [task["id"]], "action": "complete"}, headers=auth
        )
        after = client.get(f"/tasks/{task['id']}", headers=auth).json()
        assert after["updated_at"] > task["updated_at"]

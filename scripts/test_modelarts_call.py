import os
import json
import requests


def main():
    # Keep the same URL shape you pasted (including mas.* host) so we can compare behavior.
    url = (
        "https://mas.ap-southeast-1.console-intl.huaweicloud.com"
        "/v1/d0d86359a22a4ba891f920d3e50e1d4e"
        "/workflows/d86a319d-27ed-48a2-912c-74c89fa53327"
        "/conversations/{conversation_id}"
        "?version=1765736664945"
    )

    token = os.environ.get("HWC_X_AUTH_TOKEN", "").strip()
    if not token:
        raise SystemExit(
            "Missing env var HWC_X_AUTH_TOKEN. Set it to your Huawei Cloud X-Auth-Token (X-Subject-Token)."
        )

    payload = json.dumps({"query": "hello"}, ensure_ascii=False)
    headers = {"Content-Type": "application/json", "X-Auth-Token": token}

    # IMPORTANT: don't print the token.
    resp = requests.post(url, headers=headers, data=payload.encode("utf-8"), timeout=60)
    print("STATUS:", resp.status_code)
    print(resp.text[:2000])


if __name__ == "__main__":
    main()


import json
import requests


def main():
    # Keep the same URL shape you pasted (including mas.* host) so we can compare behavior.
    url = (
        "https://mas.ap-southeast-1.console-intl.huaweicloud.com"
        "/v1/d0d86359a22a4ba891f920d3e50e1d4e"
        "/workflows/d86a319d-27ed-48a2-912c-74c89fa53327"
        "/conversations/{conversation_id}"
        "?version=1765736664945"
    )

    token = os.environ.get("HWC_X_AUTH_TOKEN", "").strip()
    if not token:
        raise SystemExit(
            "Missing env var HWC_X_AUTH_TOKEN. Set it to your Huawei Cloud X-Auth-Token (X-Subject-Token)."
        )

    payload = json.dumps({"query": "hello"}, ensure_ascii=False)
    headers = {"Content-Type": "application/json", "X-Auth-Token": token}

    # IMPORTANT: don't print the token.
    resp = requests.post(url, headers=headers, data=payload.encode("utf-8"), timeout=60)
    print("STATUS:", resp.status_code)
    print(resp.text[:2000])


if __name__ == "__main__":
    main()


import json
import requests


def main():
    # Keep the same URL shape you pasted (including mas.* host) so we can compare behavior.
    url = (
        "https://mas.ap-southeast-1.console-intl.huaweicloud.com"
        "/v1/d0d86359a22a4ba891f920d3e50e1d4e"
        "/workflows/d86a319d-27ed-48a2-912c-74c89fa53327"
        "/conversations/{conversation_id}"
        "?version=1765736664945"
    )

    token = os.environ.get("HWC_X_AUTH_TOKEN", "").strip()
    if not token:
        raise SystemExit(
            "Missing env var HWC_X_AUTH_TOKEN. Set it to your Huawei Cloud X-Auth-Token (X-Subject-Token)."
        )

    payload = json.dumps({"query": "hello"}, ensure_ascii=False)
    headers = {"Content-Type": "application/json", "X-Auth-Token": token}

    # IMPORTANT: don't print the token.
    resp = requests.post(url, headers=headers, data=payload.encode("utf-8"), timeout=60)
    print("STATUS:", resp.status_code)
    print(resp.text[:2000])


if __name__ == "__main__":
    main()




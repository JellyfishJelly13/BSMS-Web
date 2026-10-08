#!/usr/bin/env python3

import time
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError


# ============================================================
# BSMS WEB STATUS CHECKER
# ============================================================

CHECK_INTERVAL = 60  # seconds

SERVICES = [
    {
        "name": "BSMS Website",
        "url": "https://bsms-web.vercel.app/",
    },
    {
        "name": "Accounts",
        "url": "https://bsms-web.vercel.app/accounts",
    },
    {
        "name": "Chat",
        "url": "https://bsms-web.vercel.app/chat",
    },
    {
        "name": "Games",
        "url": "https://bsms-web.vercel.app/g",
    },
    {
        "name": "Firebase",
        "url": "https://bsms-web-default-rtdb.firebaseio.com/.json",
    },
]


def check_service(url, timeout=10):
    """
    Check whether a URL is reachable.

    Returns:
        status, response_time_ms, error
    """

    start = time.perf_counter()

    try:
        request = Request(
            url,
            headers={
                "User-Agent": "BSMS-Status-Checker/1.0"
            }
        )

        with urlopen(request, timeout=timeout) as response:
            elapsed = (time.perf_counter() - start) * 1000

            status_code = response.status

            if 200 <= status_code < 400:
                return "operational", elapsed, None

            return "degraded", elapsed, f"HTTP {status_code}"

    except HTTPError as error:
        elapsed = (time.perf_counter() - start) * 1000

        return "degraded", elapsed, f"HTTP {error.code}"

    except URLError as error:
        elapsed = (time.perf_counter() - start) * 1000

        return "offline", elapsed, str(error.reason)

    except Exception as error:
        elapsed = (time.perf_counter() - start) * 1000

        return "offline", elapsed, str(error)


def print_status(results):
    """
    Print a formatted status report.
    """

    print()
    print("=" * 65)
    print(" BSMS WEB STATUS")
    print("=" * 65)

    operational = 0
    degraded = 0
    offline = 0

    for result in results:

        name = result["name"]
        status = result["status"]
        response_time = result["response_time"]
        error = result["error"]

        if status == "operational":
            symbol = "✓"
            operational += 1

        elif status == "degraded":
            symbol = "!"
            degraded += 1

        else:
            symbol = "✗"
            offline += 1

        print(
            f"{symbol} {name:<25} "
            f"{status:<12} "
            f"{response_time:>7.0f} ms"
        )

        if error:
            print(f"    └─ {error}")

    total = len(results)

    if offline > 0:
        overall = "MAJOR OUTAGE"

    elif degraded > 0:
        overall = "PARTIAL OUTAGE"

    else:
        overall = "ALL SYSTEMS OPERATIONAL"

    print()
    print("-" * 65)
    print(
        f"Overall: {overall} "
        f"({operational}/{total} operational)"
    )
    print(
        "Checked:",
        datetime.now().astimezone().strftime(
            "%Y-%m-%d %I:%M:%S %p %Z"
        )
    )
    print("=" * 65)


def run_check():
    """
    Perform one complete status check.
    """

    results = []

    for service in SERVICES:

        status, response_time, error = check_service(
            service["url"]
        )

        results.append({
            "name": service["name"],
            "url": service["url"],
            "status": status,
            "response_time": response_time,
            "error": error,
        })

    print_status(results)

    return results


def main():

    print("Starting BSMS Web status checker...")
    print(f"Checking every {CHECK_INTERVAL} seconds.")

    while True:

        try:
            run_check()

            time.sleep(CHECK_INTERVAL)

        except KeyboardInterrupt:
            print()
            print("BSMS status checker stopped.")
            break

        except Exception as error:
            print()
            print("Checker error:", error)
            print("Retrying...")
            time.sleep(CHECK_INTERVAL)


if __name__ == "__main__":
    main()

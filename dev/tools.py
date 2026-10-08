#!/usr/bin/env python3

"""
BSMS Web Developer Tools
------------------------

Usage:

    python3 tools/bsms_dev.py check
    python3 tools/bsms_dev.py json
    python3 tools/bsms_dev.py links
    python3 tools/bsms_dev.py versions
    python3 tools/bsms_dev.py info
    python3 tools/bsms_dev.py all

This tool is designed to run from anywhere inside the BSMS Web repository.
"""

import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


# ============================================================
# CONFIGURATION
# ============================================================

PROJECT_NAME = "BSMS Web"

# Automatically find the repository root.
# Assumes this file is located at:
# BSMS-Web/tools/bsms_dev.py
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

# Directories/files we don't want to scan.
IGNORED_DIRECTORIES = {
    ".git",
    "node_modules",
    ".vercel",
    ".next",
    "dist",
    "build",
}

# Files that should exist in a healthy project.
IMPORTANT_FILES = [
    "index.html",
    "404.html",
    "README.md",
    "vercel.json",
]


# ============================================================
# OUTPUT HELPERS
# ============================================================

def header(title):
    print()
    print("=" * 70)
    print(f" {title}")
    print("=" * 70)


def success(message):
    print(f"✓ {message}")


def warning(message):
    print(f"! {message}")


def error(message):
    print(f"✗ {message}")


def info(message):
    print(f"• {message}")


# ============================================================
# FILE HELPERS
# ============================================================

def iter_project_files():
    """
    Return files in the project while ignoring build/dependency folders.
    """

    for root, directories, files in os.walk(PROJECT_ROOT):

        directories[:] = [
            directory
            for directory in directories
            if directory not in IGNORED_DIRECTORIES
        ]

        for filename in files:
            yield Path(root) / filename


def get_relative_path(path):
    """
    Convert an absolute path into a project-relative path.
    """

    return path.relative_to(PROJECT_ROOT)


# ============================================================
# PROJECT INFORMATION
# ============================================================

def show_info():
    header("BSMS WEB PROJECT INFO")

    print(f"Project: {PROJECT_NAME}")
    print(f"Path:    {PROJECT_ROOT}")

    files = list(iter_project_files())

    html_files = [
        file for file in files
        if file.suffix.lower() == ".html"
    ]

    js_files = [
        file for file in files
        if file.suffix.lower() == ".js"
    ]

    ts_files = [
        file for file in files
        if file.suffix.lower() in {".ts", ".tsx"}
    ]

    css_files = [
        file for file in files
        if file.suffix.lower() == ".css"
    ]

    json_files = [
        file for file in files
        if file.suffix.lower() == ".json"
    ]

    py_files = [
        file for file in files
        if file.suffix.lower() == ".py"
    ]

    print()
    print("Files:")
    print(f"  HTML:       {len(html_files)}")
    print(f"  JavaScript: {len(js_files)}")
    print(f"  TypeScript: {len(ts_files)}")
    print(f"  CSS:        {len(css_files)}")
    print(f"  JSON:       {len(json_files)}")
    print(f"  Python:     {len(py_files)}")
    print(f"  Total:      {len(files)}")


# ============================================================
# IMPORTANT FILE CHECK
# ============================================================

def check_important_files():
    header("IMPORTANT FILES")

    all_good = True

    for filename in IMPORTANT_FILES:

        path = PROJECT_ROOT / filename

        if path.exists():
            success(filename)

        else:
            error(f"{filename} is missing")
            all_good = False

    return all_good


# ============================================================
# JSON VALIDATION
# ============================================================

def validate_json():

    header("JSON VALIDATION")

    json_files = [
        file
        for file in iter_project_files()
        if file.suffix.lower() == ".json"
    ]

    if not json_files:
        info("No JSON files found.")
        return True

    all_good = True

    for file in json_files:

        try:

            with open(file, "r", encoding="utf-8") as handle:
                json.load(handle)

            success(str(get_relative_path(file)))

        except json.JSONDecodeError as exc:

            error(
                f"{get_relative_path(file)} "
                f"line {exc.lineno}, column {exc.colno}: "
                f"{exc.msg}"
            )

            all_good = False

        except Exception as exc:

            error(
                f"{get_relative_path(file)}: {exc}"
            )

            all_good = False

    return all_good


# ============================================================
# BASIC HTML CHECK
# ============================================================

def check_html():

    header("HTML CHECK")

    html_files = [
        file
        for file in iter_project_files()
        if file.suffix.lower() == ".html"
    ]

    if not html_files:
        info("No HTML files found.")
        return True

    all_good = True

    for file in html_files:

        try:

            content = file.read_text(encoding="utf-8")

        except UnicodeDecodeError:

            error(f"{get_relative_path(file)} is not valid UTF-8")
            all_good = False
            continue

        relative = get_relative_path(file)

        # Basic DOCTYPE check
        if "<!DOCTYPE html>" not in content.upper():
            warning(f"{relative}: missing <!DOCTYPE html>")

        # Basic HTML structure checks
        if "<html" not in content.lower():
            warning(f"{relative}: missing <html>")

        if "<head" not in content.lower():
            warning(f"{relative}: missing <head>")

        if "<body" not in content.lower():
            warning(f"{relative}: missing <body>")

        # Check for browser alerts
        if "alert(" in content:
            warning(f"{relative}: browser alert() detected")

    if all_good:
        success("HTML scan completed.")

    return all_good


# ============================================================
# JAVASCRIPT CHECK
# ============================================================

def check_javascript():

    header("JAVASCRIPT CHECK")

    js_files = [
        file
        for file in iter_project_files()
        if file.suffix.lower() == ".js"
    ]

    if not js_files:
        info("No JavaScript files found.")
        return True

    warnings = 0

    for file in js_files:

        try:
            content = file.read_text(encoding="utf-8")
        except Exception:
            continue

        relative = get_relative_path(file)

        # Browser alert detection
        if "alert(" in content:
            warning(f"{relative}: alert() detected")
            warnings += 1

        # Very basic TODO/FIXME scan
        if "TODO" in content:
            warning(f"{relative}: TODO found")
            warnings += 1

        if "FIXME" in content:
            warning(f"{relative}: FIXME found")
            warnings += 1

    if warnings == 0:
        success("No basic JavaScript warnings found.")
    else:
        info(f"{warnings} JavaScript warning(s) found.")

    return True


# ============================================================
# SECRET SCAN
# ============================================================

def security_scan():

    header("BASIC SECURITY SCAN")

    suspicious_patterns = [
        r"password\s*=\s*['\"][^'\"]+['\"]",
        r"secret\s*=\s*['\"][^'\"]+['\"]",
        r"api[_-]?key\s*=\s*['\"][^'\"]+['\"]",
        r"private[_-]?key\s*=\s*['\"][^'\"]+['\"]",
    ]

    compiled_patterns = [
        re.compile(pattern, re.IGNORECASE)
        for pattern in suspicious_patterns
    ]

    findings = 0

    for file in iter_project_files():

        # Don't scan the Python script itself.
        if file == Path(__file__).resolve():
            continue

        # Don't scan binary files.
        if file.suffix.lower() in {
            ".png",
            ".jpg",
            ".jpeg",
            ".gif",
            ".webp",
            ".ico",
            ".woff",
            ".woff2",
            ".ttf",
            ".otf",
            ".zip",
        }:
            continue

        try:
            content = file.read_text(
                encoding="utf-8",
                errors="ignore"
            )
        except Exception:
            continue

        for pattern in compiled_patterns:

            if pattern.search(content):

                error(
                    f"Possible secret in "
                    f"{get_relative_path(file)}"
                )

                findings += 1
                break

    if findings == 0:
        success("No obvious hard-coded secrets detected.")

    else:
        warning(
            f"{findings} possible secret(s) detected. "
            "Review them manually."
        )

    return findings == 0


# ============================================================
# VERSION CHECK
# ============================================================

def find_versions():

    header("VERSION INFORMATION")

    version_files = []

    for file in iter_project_files():

        if file.suffix.lower() not in {
            ".html",
            ".js",
            ".json",
            ".ts",
            ".tsx",
        }:
            continue

        try:
            content = file.read_text(
                encoding="utf-8",
                errors="ignore"
            )
        except Exception:
            continue

        # Look for common BSMS version patterns.
        patterns = [
            r'PAGE_VERSION\s*=\s*["\']([^"\']+)["\']',
            r'version["\']?\s*[:=]\s*["\']([^"\']+)["\']',
            r'v(\d+\.\d+\.\d+)',
        ]

        found = set()

        for pattern in patterns:

            matches = re.findall(
                pattern,
                content,
                flags=re.IGNORECASE
            )

            for match in matches:
                found.add(match)

        if found:

            version_files.append(
                (
                    get_relative_path(file),
                    sorted(found)
                )
            )

    if not version_files:

        info("No version information found.")
        return

    for filename, versions in version_files:

        print(f"{filename}")

        for version in versions:
            print(f"  → {version}")


# ============================================================
# URL CHECK
# ============================================================

def check_url(url):

    try:

        start = time.perf_counter()

        request = Request(
            url,
            headers={
                "User-Agent": "BSMS-Web-Dev-Tools/1.0"
            }
        )

        with urlopen(request, timeout=10) as response:

            elapsed = (
                time.perf_counter() - start
            ) * 1000

            return (
                True,
                response.status,
                elapsed
            )

    except HTTPError as exc:

        return False, exc.code, 0

    except URLError:

        return False, None, 0

    except Exception:

        return False, None, 0


def check_live_site():

    header("LIVE BSMS CHECK")

    urls = [
        "https://bsms-web.vercel.app/",
        "https://bsms-web.vercel.app/accounts",
        "https://bsms-web.vercel.app/chat",
        "https://bsms-web.vercel.app/g",
        "https://bsms-web.vercel.app/countdown",
    ]

    for url in urls:

        success_result, status_code, response_time = check_url(url)

        if success_result:

            success(
                f"{url} → HTTP {status_code} "
                f"({response_time:.0f} ms)"
            )

        else:

            error(
                f"{url} → "
                f"{status_code or 'UNREACHABLE'}"
            )


# ============================================================
# FULL CHECK
# ============================================================

def run_all():

    header("BSMS WEB DEVELOPER CHECK")

    print(f"Project: {PROJECT_NAME}")
    print(f"Root:    {PROJECT_ROOT}")

    important_ok = check_important_files()
    json_ok = validate_json()
    check_html()
    check_javascript()
    security_ok = security_scan()

    print()
    print("=" * 70)
    print(" SUMMARY")
    print("=" * 70)

    if important_ok:
        success("Important files")
    else:
        error("Important files")

    if json_ok:
        success("JSON validation")
    else:
        error("JSON validation")

    if security_ok:
        success("Security scan")
    else:
        warning("Security scan requires review")

    print()


# ============================================================
# HELP
# ============================================================

def show_help():

    print(
        """
BSMS Web Developer Tools

Usage:

  python3 tools/bsms_dev.py <command>

Commands:

  check
      Check important project files.

  json
      Validate every JSON file in the project.

  html
      Run basic HTML checks.

  js
      Run basic JavaScript checks.

  security
      Scan for obvious hard-coded secrets.

  versions
      Find version information in the project.

  live
      Check the live BSMS Web website.

  info
      Show project statistics.

  all
      Run the complete developer check.

  help
      Show this help message.
"""
    )


# ============================================================
# MAIN
# ============================================================

def main():

    if len(sys.argv) < 2:

        show_help()
        return

    command = sys.argv[1].lower()

    if command == "check":

        check_important_files()

    elif command == "json":

        validate_json()

    elif command == "html":

        check_html()

    elif command == "js":

        check_javascript()

    elif command == "security":

        security_scan()

    elif command == "versions":

        find_versions()

    elif command == "live":

        check_live_site()

    elif command == "info":

        show_info()

    elif command == "all":

        run_all()

    elif command in {"help", "-h", "--help"}:

        show_help()

    else:

        error(f"Unknown command: {command}")
        print()
        show_help()


if __name__ == "__main__":
    main()

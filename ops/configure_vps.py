"""Generate the first VPS environment without replacing existing credentials."""
import getpass
import os
from pathlib import Path
import re
import secrets
import sys


def read_env(filename):
    values = {}
    for line in Path(filename).read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] in "\"'" and value[-1] == value[0]:
            value = value[1:-1]
        values[key.strip()] = value
    return values


def prompt(key, label, default="", secret=False, required=True):
    value = os.environ.get(key, "")
    if not value:
        if not sys.stdin.isatty():
            if required and not default:
                raise ValueError(f"Set {key} or run this command in an interactive SSH terminal.")
            return default
        suffix = f" [{default}]" if default else ""
        value = (getpass.getpass if secret else input)(label + suffix + ": ").strip()
    value = value or default
    if required and not value:
        raise ValueError(f"{key} is required.")
    if any(char in value for char in "\r\n\x00"):
        raise ValueError(f"{key} must be a single line.")
    return value


def validate_domain(domain):
    if len(domain) > 253 or not re.fullmatch(r"(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}", domain):
        raise ValueError("Enter a domain such as football.yourdomain.vn, without https:// or a path.")


def configure(filename=".env", domain=None):
    path = Path(filename)
    if path.exists():
        values = read_env(path)
        required = ["APP_IMAGE", "APP_DOMAIN", "AUTH_URL", "AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "CRON_SECRET", "DATABASE_URL", "REDIS_URL", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_ROOT_PASSWORD", "MYSQL_DATABASE"]
        missing = [key for key in required if not values.get(key) or "REPLACE_WITH" in values[key] or "YOUR-" in values[key]]
        if missing:
            raise ValueError("Existing .env was preserved. Configure these VPS settings first: " + ", ".join(missing))
        validate_domain(values["APP_DOMAIN"])
        if domain and values["APP_DOMAIN"] != domain:
            raise ValueError("The supplied domain differs from APP_DOMAIN in .env. Existing configuration was preserved.")
        if values["AUTH_URL"] != "https://" + values["APP_DOMAIN"]:
            raise ValueError("Set AUTH_URL=https://APP_DOMAIN in the existing VPS .env.")
        print("Using the existing VPS .env; credentials are unchanged.")
        return values

    domain = domain or prompt("APP_DOMAIN", "Domain pointing to this VPS")
    validate_domain(domain)
    print("Google OAuth redirect URI: https://" + domain + "/api/auth/callback/google")
    google_id = prompt("AUTH_GOOGLE_ID", "Google OAuth Client ID")
    google_secret = prompt("AUTH_GOOGLE_SECRET", "Google OAuth Client Secret", secret=True)
    admin_emails = prompt("ADMIN_EMAILS", "Admin Google email(s), comma-separated", required=False)
    db_password = secrets.token_hex(24)
    values = {
        "APP_IMAGE": "capfootball:local", "APP_DOMAIN": domain,
        "MYSQL_ROOT_PASSWORD": secrets.token_hex(32), "MYSQL_USER": "capfootball",
        "MYSQL_PASSWORD": db_password, "MYSQL_DATABASE": "capfootball",
        "DATABASE_URL": f"mysql://capfootball:{db_password}@mysql:3306/capfootball",
        "REDIS_URL": "redis://redis:6379", "AUTH_URL": "https://" + domain,
        "AUTH_SECRET": secrets.token_hex(32), "AUTH_GOOGLE_ID": google_id,
        "AUTH_GOOGLE_SECRET": google_secret, "ADMIN_EMAILS": admin_emails,
        "CRON_SECRET": secrets.token_hex(32), "REALTIME_DRIVER": "socketio",
        "NEXT_PUBLIC_REALTIME_DRIVER": "socketio", "NEXT_PUBLIC_SOCKET_URL": "", "SOCKET_PORT": "3001",
        "SMTP_HOST": "", "SMTP_PORT": "465", "SMTP_SECURE": "true",
        "SMTP_USER": "", "SMTP_PASS": "", "EMAIL_FROM": "", "LOG_LEVEL": "info",
    }
    if os.environ.get("SMTP_HOST") or prompt("ENABLE_SMTP", "Configure SMTP email? y/N", "n").lower() == "y":
        values["SMTP_HOST"] = prompt("SMTP_HOST", "SMTP host", "smtp.gmail.com")
        values["SMTP_PORT"] = prompt("SMTP_PORT", "SMTP port", "465")
        if not values["SMTP_PORT"].isdigit() or not 1 <= int(values["SMTP_PORT"]) <= 65535:
            raise ValueError("SMTP_PORT must be between 1 and 65535.")
        values["SMTP_SECURE"] = prompt("SMTP_SECURE", "SMTP secure (true/false)", "true" if values["SMTP_PORT"] == "465" else "false")
        if values["SMTP_SECURE"] not in ("true", "false"):
            raise ValueError("SMTP_SECURE must be true or false.")
        values["SMTP_USER"] = prompt("SMTP_USER", "SMTP account email")
        values["SMTP_PASS"] = prompt("SMTP_PASS", "SMTP password (Gmail: App Password)", secret=True)
        values["EMAIL_FROM"] = prompt("EMAIL_FROM", "Sender", "CapFootBall <" + values["SMTP_USER"] + ">")
    # Compose single-quoted values preserve literal dollar signs in passwords.
    content = "# Generated by ops/install.sh; contains private credentials.\n"
    for key, value in values.items():
        content += key + "='" + value.replace("'", "\\'") + "'\n"
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as output:
        output.write(content)
    print("Created .env with new independent database, auth and cron secrets.")
    return values


if __name__ == "__main__":
    try:
        if len(sys.argv) > 2:
            raise ValueError("Usage: python3 ops/configure_vps.py [domain]")
        configure(domain=sys.argv[1] if len(sys.argv) == 2 else None)
    except (ValueError, FileExistsError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)

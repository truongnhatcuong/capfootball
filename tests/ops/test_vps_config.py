import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("configure_vps", ROOT / "ops/configure_vps.py")
config = importlib.util.module_from_spec(spec)
spec.loader.exec_module(config)


class VpsConfigTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / ".cache")
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.env_file = self.directory / ".env"
        self.credentials = {"AUTH_GOOGLE_ID": "test-client-id", "AUTH_GOOGLE_SECRET": "test-client-secret", "ENABLE_SMTP": "n", "ADMIN_EMAILS": "admin@example.test"}

    def create(self, extra=None):
        with patch.dict(os.environ, {**self.credentials, **(extra or {})}, clear=True), contextlib.redirect_stdout(io.StringIO()) as output:
            values = config.configure(self.env_file, "football.example.test")
        return values, output.getvalue()

    def test_new_config_has_matching_database_credentials_and_independent_secrets(self):
        values, output = self.create()
        self.assertEqual(urlparse(values["DATABASE_URL"]).password, values["MYSQL_PASSWORD"])
        self.assertEqual(urlparse(values["DATABASE_URL"]).hostname, "mysql")
        self.assertEqual(values["REDIS_URL"], "redis://redis:6379")
        self.assertEqual(len({values[key] for key in ["MYSQL_PASSWORD", "MYSQL_ROOT_PASSWORD", "AUTH_SECRET", "CRON_SECRET"]}), 4)
        self.assertNotIn(values["AUTH_SECRET"], output)
        self.assertNotIn(values["AUTH_GOOGLE_SECRET"], output)
        if os.name == "posix":
            self.assertEqual(self.env_file.stat().st_mode & 0o777, 0o600)

    def test_rerun_preserves_configuration_and_secrets(self):
        original, _ = self.create()
        content = self.env_file.read_bytes()
        with contextlib.redirect_stdout(io.StringIO()):
            repeated = config.configure(self.env_file)
        self.assertEqual(repeated, original)
        self.assertEqual(self.env_file.read_bytes(), content)
        with self.assertRaises(ValueError):
            config.configure(self.env_file, "different.example.test")
        self.assertEqual(self.env_file.read_bytes(), content)

    def test_incomplete_existing_env_is_never_overwritten(self):
        content = "DATABASE_URL=mysql://example.invalid/local\n"
        self.env_file.write_text(content, encoding="utf-8")
        with self.assertRaises(ValueError):
            config.configure(self.env_file, "football.example.test")
        self.assertEqual(self.env_file.read_text(encoding="utf-8"), content)

    def test_invalid_domains_do_not_create_an_env_file(self):
        for domain in ["https://example.test", "example.test/path", "example.test:3000", "bad domain", "-bad.example.test", "example.test\nBAD=value"]:
            with self.assertRaises(ValueError):
                config.configure(self.env_file, domain)
            self.assertFalse(self.env_file.exists())

    def test_multiline_input_does_not_create_an_env_file(self):
        with self.assertRaises(ValueError):
            self.create({"AUTH_GOOGLE_SECRET": "first\nINJECTED=value"})
        self.assertFalse(self.env_file.exists())

    @unittest.skipUnless(shutil.which("docker"), "Docker CLI is required for Compose parsing")
    def test_compose_preserves_smtp_password_and_generated_credentials(self):
        password = "literal$dollar'quote\\backslash"
        values, _ = self.create({"SMTP_HOST": "smtp.example.test", "SMTP_PORT": "587", "SMTP_SECURE": "false", "SMTP_USER": "sender@example.test", "SMTP_PASS": password, "EMAIL_FROM": "CapFootBall <sender@example.test>"})
        shutil.copyfile(ROOT / "docker-compose.yml", self.directory / "docker-compose.yml")
        result = subprocess.run(["docker", "compose", "--project-directory", str(self.directory), "--env-file", str(self.env_file), "-f", str(self.directory / "docker-compose.yml"), "config", "--format", "json"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        services = json.loads(result.stdout)["services"]
        # `compose config` escapes literal dollars when serializing its output.
        self.assertEqual(services["app"]["environment"]["SMTP_PASS"].replace("$$", "$"), password)
        self.assertEqual(services["app"]["environment"]["DATABASE_URL"], values["DATABASE_URL"])
        self.assertEqual(services["mysql"]["environment"]["MYSQL_PASSWORD"], values["MYSQL_PASSWORD"])


if __name__ == "__main__":
    unittest.main()

import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[2]
GIT_BASH = Path("C:/Program Files/Git/bin/bash.exe")
BASH = str(GIT_BASH) if os.name == "nt" and GIT_BASH.exists() else shutil.which("bash")
SHA = "a" * 40


@unittest.skipUnless(BASH, "Bash is required to check the SSH deployment script")
class SourceDeployTests(unittest.TestCase):
    def setUp(self):
        (ROOT / ".cache").mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / ".cache")
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.bin = self.directory / "bin"
        self.bin.mkdir()
        self.log = self.directory / "commands.log"
        self.env_file = self.directory / ".env"
        self.env_content = b"DATABASE_URL=mysql://existing/database\nSMTP_PASS='keep$this-secret'\nREALTIME_DRIVER=socketio\nNEXT_PUBLIC_REALTIME_DRIVER=socketio\n"
        self.env_file.write_bytes(self.env_content)
        workflow = (ROOT / ".github/workflows/deploy.yml").read_text(encoding="utf-8")
        self.script = self.directory / "deploy.sh"
        self.script.write_text(textwrap.dedent(workflow.split("script: |\n", 1)[1]), encoding="utf-8", newline="\n")
        self.command("git", '''
            if [ "$1" = "rev-parse" ]; then printf '%s\\n' "$TEST_HEAD"; exit 0; fi
            printf 'git %s\\n' "$*" >> "$TEST_COMMAND_LOG"
        ''')
        self.command("docker", '''
            printf 'docker %s\\n' "$*" >> "$TEST_COMMAND_LOG"
            case "$*" in
              *"node:22-bookworm-slim node -e"*) cat .env ;;
            esac
            case "$TEST_FAIL_STAGE:$*" in
              build:build* | health:exec*) exit 23 ;;
            esac
        ''')
        self.command("sleep", "exit 0")

    def command(self, name, content):
        filename = self.bin / name
        filename.write_text("#!/usr/bin/env bash\nset -eu\n" + textwrap.dedent(content), encoding="utf-8", newline="\n")
        filename.chmod(0o755)

    def run_deploy(self, failure="", head=SHA):
        env = {**os.environ, "DEPLOY_PATH": self.directory.as_posix(), "DEPLOY_SHA": SHA,
               "TEST_HEAD": head, "TEST_FAIL_STAGE": failure, "TEST_COMMAND_LOG": self.log.as_posix(),
               "TEST_BIN": self.bin.as_posix(), "TEST_SCRIPT": self.script.as_posix(),
               "PUBLIC_SOCKET_URL": "https://football.example.test", "PUBLIC_VAPID_KEY": "test-public-key"}
        # Git Bash prepends its own tools at startup; put the mocks first inside Bash.
        bin_path = '$(cygpath -u "$TEST_BIN")' if os.name == "nt" else "$TEST_BIN"
        command = 'export PATH="' + bin_path + ':$PATH"; bash "$TEST_SCRIPT"'
        result = subprocess.run([BASH, "-c", command], env=env, capture_output=True, text=True, timeout=15)
        self.assertEqual(self.env_file.read_bytes(), self.env_content)
        self.assertNotIn("keep$this-secret", result.stdout + result.stderr)
        commands = self.log.read_text(encoding="utf-8") if self.log.exists() else ""
        return result, commands

    def test_success_preserves_environment_and_checks_both_services(self):
        result, commands = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Deploy success!", result.stdout)
        self.assertIn("docker exec capfootball-app-1", commands)
        self.assertIn("docker exec capfootball-realtime-1", commands)
        self.assertIn("--env PORT=3019", commands)
        self.assertIn("--env SOCKET_PORT=3020", commands)
        self.assertIn("--env-file", commands)
        self.assertNotIn("docker rmi", commands)
        self.assertNotIn("docker compose", commands)
        self.assertNotIn("migrate deploy", commands)
        self.assertNotIn("prisma/seed.ts", commands)
        self.assertLess(commands.index("docker build"), commands.index("docker rm -f"))

    def test_build_failure_does_not_migrate_or_replace_running_services(self):
        result, commands = self.run_deploy("build")
        self.assertEqual(result.returncode, 23, result.stderr)
        self.assertIn("docker build", commands)
        self.assertNotIn(" migrate deploy", commands)
        self.assertNotIn("docker rm", commands)
        self.assertNotIn("docker run -d", commands)
        self.assertNotIn("Deploy success!", result.stdout)

    def test_existing_pusher_configuration_is_used_without_a_socket_container(self):
        self.env_content = self.env_content.replace(b"socketio", b"pusher")
        self.env_content += b"NEXT_PUBLIC_PUSHER_KEY=test-public-pusher-key\nNEXT_PUBLIC_PUSHER_CLUSTER=ap1\n"
        self.env_file.write_bytes(self.env_content)
        result, commands = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("NEXT_PUBLIC_REALTIME_DRIVER=pusher", commands)
        self.assertIn("NEXT_PUBLIC_PUSHER_KEY=test-public-pusher-key", commands)
        self.assertNotIn("--name capfootball-realtime-1", commands)
        self.assertNotIn("docker exec capfootball-realtime-1", commands)
        self.assertNotIn("migrate deploy", commands)
        self.assertNotIn("prisma/seed.ts", commands)

    def test_mismatched_realtime_configuration_does_not_build_or_replace_containers(self):
        self.env_content = self.env_content.replace(b"NEXT_PUBLIC_REALTIME_DRIVER=socketio", b"NEXT_PUBLIC_REALTIME_DRIVER=pusher")
        self.env_file.write_bytes(self.env_content)
        result, commands = self.run_deploy()
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertNotIn("docker build", commands)
        self.assertNotIn("docker rm", commands)

    def test_unhealthy_services_do_not_report_deploy_success(self):
        result, commands = self.run_deploy("health")
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("docker run -d", commands)
        self.assertIn("Deployment health check failed", result.stderr)
        self.assertNotIn("Deploy success!", result.stdout)

    def test_changed_commit_does_not_build(self):
        result, commands = self.run_deploy(head="b" * 40)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn("main has changed", result.stderr)
        self.assertNotIn("docker", commands)


if __name__ == "__main__":
    unittest.main()

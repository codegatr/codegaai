"""Installation contract tests for developer and end-user setup."""

from __future__ import annotations

from pathlib import Path
import unittest

from packaging.requirements import InvalidRequirement, Requirement


ROOT = Path(__file__).resolve().parents[1]


class TestInstallationContracts(unittest.TestCase):
    def test_requirements_file_contains_no_bare_pip_options(self) -> None:
        req_file = ROOT / "requirements.txt"
        bad_lines: list[tuple[int, str]] = []

        for line_no, raw_line in enumerate(req_file.read_text(encoding="utf-8").splitlines(), 1):
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line in {"-e", "--editable", "-r", "--requirement"}:
                bad_lines.append((line_no, line))

        self.assertEqual([], bad_lines)

    def test_tts_dependency_is_not_forced_on_python_312(self) -> None:
        req_file = ROOT / "requirements.txt"
        tts_requirements: list[Requirement] = []

        for line_no, raw_line in enumerate(req_file.read_text(encoding="utf-8").splitlines(), 1):
            line = raw_line.split("#", 1)[0].strip()
            if not line or line.startswith("-"):
                continue
            try:
                req = Requirement(line)
            except InvalidRequirement as exc:
                self.fail(f"Invalid requirement on line {line_no}: {raw_line!r} ({exc})")
            if req.name.lower() == "tts":
                tts_requirements.append(req)

        self.assertEqual(1, len(tts_requirements))
        marker = tts_requirements[0].marker
        self.assertIsNotNone(marker)
        self.assertFalse(marker.evaluate({"python_version": "3.12"}))
        self.assertTrue(marker.evaluate({"python_version": "3.11"}))

    def test_platform_build_workflows_can_publish_manual_releases(self) -> None:
        for workflow_name in ("build-macos.yml", "build-windows.yml"):
            workflow = (ROOT / ".github" / "workflows" / workflow_name).read_text(encoding="utf-8-sig")
            self.assertIn("release_tag:", workflow)
            self.assertIn("tag_name: ${{ steps.version.outputs.tag }}", workflow)
            self.assertIn("target_commitish: ${{ github.sha }}", workflow)
            self.assertIn("github.event.inputs.release_tag != ''", workflow)
            self.assertIn("generate_release_notes: true", workflow)


if __name__ == "__main__":
    unittest.main()

"""Exercise delivery rules against real, isolated Git histories."""

from pathlib import Path
import subprocess
import tempfile
import unittest

from check_collaboration import check_records, validate_record


RECORD = '# Test\n\n' + '\n\n'.join(
    f'## {heading}\n\n实际完成的内容。' for heading in ('任务', '改动', '验证', '未完成与风险')
)
RECORD_PATH = 'docs/changes/2026-11-15-task-1.md'


class DeliveryRulesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git('init', '-q')
        self.git('config', 'user.name', 'Test')
        self.git('config', 'user.email', 'test@example.invalid')
        self.write('docs/changes/2026-11-14-original.md', RECORD)
        self.commit()
        self.base = self.git('rev-parse', 'HEAD').strip()

    def git(self, *args):
        return subprocess.run(['git', *args], cwd=self.root, check=True,
                              capture_output=True, text=True).stdout

    def write(self, path, text):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding='utf-8')

    def commit(self):
        self.git('add', '--all')
        self.git('commit', '-qm', 'test')

    def test_new_filled_record_passes(self):
        self.write(RECORD_PATH, RECORD)
        self.commit()
        self.assertEqual(check_records(self.root, self.base), [])

    def test_code_without_record_fails(self):
        self.write('game.js', 'console.log("change");')
        self.commit()
        self.assertTrue(any('Add a delivery record' in e for e in check_records(self.root, self.base)))

    def test_rewriting_history_fails_even_with_new_record(self):
        self.write('docs/changes/2026-11-14-original.md', RECORD + '\nChanged')
        self.write(RECORD_PATH, RECORD)
        self.commit()
        self.assertTrue(any('read-only' in e for e in check_records(self.root, self.base)))

    def test_deleting_history_fails(self):
        (self.root / 'docs/changes/2026-11-14-original.md').unlink()
        self.write(RECORD_PATH, RECORD)
        self.commit()
        self.assertTrue(any('read-only' in e for e in check_records(self.root, self.base)))

    def test_missing_or_placeholder_section_fails(self):
        self.assertTrue(validate_record(RECORD_PATH, '# Empty'))
        for placeholder in ('<!-- fill this -->', 'TODO', '待填写'):
            with self.subTest(placeholder=placeholder):
                text = RECORD.replace('## 验证\n\n实际完成的内容。', f'## 验证\n\n{placeholder}')
                self.assertTrue(any('验证' in e for e in validate_record(RECORD_PATH, text)))

    def test_invalid_name_fails(self):
        self.assertTrue(validate_record('docs/changes/notes.md', RECORD))


if __name__ == '__main__':
    unittest.main()

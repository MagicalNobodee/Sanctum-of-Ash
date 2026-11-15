"""Check startup freshness with isolated repositories, without touching real remotes."""

from pathlib import Path
import subprocess
import tempfile
import unittest

from check_task_start import check_start


class TaskStartTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.remote = self.root / 'remote.git'
        self.source = self.root / 'source'
        self.task = self.root / 'task'
        self.git(self.root, 'init', '-q', '--bare', str(self.remote))
        self.git(self.root, 'init', '-q', '-b', 'main', str(self.source))
        self.git(self.source, 'config', 'user.name', 'Test')
        self.git(self.source, 'config', 'user.email', 'test@example.invalid')
        self.advance_main('initial')
        self.git(self.source, 'remote', 'add', 'origin', str(self.remote))
        self.git(self.source, 'push', '-q', 'origin', 'main')
        self.git(self.root, 'clone', '-q', '-b', 'main', str(self.remote), str(self.task))

    def git(self, root, *args):
        return subprocess.run(['git', *args], cwd=root, check=True,
                              capture_output=True, text=True).stdout.strip()

    def advance_main(self, text):
        (self.source / 'game.txt').write_text(text)
        self.git(self.source, 'add', 'game.txt')
        self.git(self.source, 'commit', '-qm', text)

    def test_current_main_passes(self):
        base, head = check_start(self.task)
        self.assertEqual(base, head)

    def test_branch_with_own_commits_passes(self):
        self.git(self.task, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
                 'commit', '--allow-empty', '-qm', 'own work')
        base, head = check_start(self.task)
        self.assertNotEqual(base, head)

    def test_new_remote_commit_is_fetched_and_stale_branch_rejected(self):
        self.advance_main('other developer finished')
        self.git(self.source, 'push', '-q', 'origin', 'main')
        with self.assertRaises(RuntimeError):
            check_start(self.task)
        self.assertEqual(self.git(self.task, 'rev-parse', 'origin/main'),
                         self.git(self.source, 'rev-parse', 'HEAD'))

    def test_staged_unstaged_and_untracked_work_is_preserved(self):
        (self.task / 'game.txt').write_text('staged')
        self.git(self.task, 'add', 'game.txt')
        (self.task / 'game.txt').write_text('unstaged')
        (self.task / 'other-task.txt').write_text('untracked')
        before = [self.git(self.task, *args) for args in
                  [('status', '--porcelain'), ('diff',), ('diff', '--cached')]]
        check_start(self.task)
        after = [self.git(self.task, *args) for args in
                 [('status', '--porcelain'), ('diff',), ('diff', '--cached')]]
        self.assertEqual(before, after)
        self.assertEqual((self.task / 'other-task.txt').read_text(), 'untracked')

    def test_unreachable_remote_fails_despite_cached_main(self):
        self.git(self.task, 'remote', 'set-url', 'origin', str(self.root / 'missing.git'))
        with self.assertRaises(subprocess.CalledProcessError):
            check_start(self.task)

    def test_deleted_remote_main_fails_despite_cached_main(self):
        self.git(self.remote, 'update-ref', '-d', 'refs/heads/main')
        with self.assertRaises(subprocess.CalledProcessError):
            check_start(self.task)


if __name__ == '__main__':
    unittest.main()

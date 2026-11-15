"""Fetch main and reject task branches that do not contain its latest commit."""

from pathlib import Path
import subprocess
import sys


def git(root, *args, check=True):
    return subprocess.run(['git', *args], cwd=root, check=check,
                          capture_output=True, text=True, timeout=30)


def check_start(root):
    # An explicit ref also fails if main was removed, rather than trusting a cached ref.
    git(root, 'fetch', 'origin', 'refs/heads/main:refs/remotes/origin/main')
    base = git(root, 'rev-parse', 'origin/main').stdout.strip()
    head = git(root, 'rev-parse', 'HEAD').stdout.strip()
    result = git(root, 'merge-base', '--is-ancestor', base, head, check=False)
    if result.returncode:
        raise RuntimeError(
            f'当前任务未包含最新 main（{base[:12]}）。'
            '请保留现有工作，安全合并最新主线后重试；不要清空或覆盖他人改动。'
        )
    return base, head


def main():
    root = Path(__file__).resolve().parents[1]
    try:
        base, head = check_start(root)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except (subprocess.SubprocessError, OSError):
        print('无法获取或核验远端主线；不能将本地缓存视为最新。请检查网络、权限和 Git 状态。',
              file=sys.stderr)
        return 1
    print(f'开工基线检查通过：main={base} HEAD={head}')
    print('接着读取相关最新源码、提交和任务，按具体属性/效果核对重复与认领；此检查不代替语义判断。')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

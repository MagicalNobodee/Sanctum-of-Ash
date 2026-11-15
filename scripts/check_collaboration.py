"""Require one new, filled delivery record per PR; keep existing records immutable."""

import argparse
from pathlib import Path
import re
import subprocess
import sys


HEADINGS = ('任务', '改动', '验证', '未完成与风险')
RECORD_NAME = re.compile(r'\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md')


def validate_record(path, text):
    errors = []
    if not RECORD_NAME.fullmatch(Path(path).name):
        errors.append(f'{path}: use YYYY-MM-DD-task-name.md')
    text = re.sub(r'<!--.*?-->', '', text, flags=re.S)
    sections = dict(re.findall(r'^## ([^\n]+)\n(.*?)(?=^## |\Z)', text, re.M | re.S))
    for heading in HEADINGS:
        content = sections.get(heading, '').strip()
        if not content or content.upper() in ('TODO', 'TBD') or content == '待填写':
            errors.append(f'{path}: fill section "{heading}"')
    return errors


def check_records(root, base):
    result = subprocess.run(
        ['git', 'diff', '--no-renames', '--name-status', '-z', f'{base}...HEAD',
         '--', 'docs/changes/'],
        cwd=root, check=True, capture_output=True, text=True,
    )
    fields = result.stdout.split('\0')[:-1]
    errors = []
    added = 0
    for status, path in zip(fields[::2], fields[1::2]):
        if status != 'A':
            errors.append(f'{path}: existing records are read-only; append a correction instead')
            continue
        added += 1
        errors.extend(validate_record(path, (root / path).read_text(encoding='utf-8')))
    if not added:
        errors.append('Add a delivery record at docs/changes/YYYY-MM-DD-task-name.md')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', required=True, help='PR base commit or local base ref')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    try:
        errors = check_records(root, args.base)
    except (subprocess.CalledProcessError, OSError, UnicodeError) as exc:
        print(f'Cannot check collaboration records: {exc}', file=sys.stderr)
        return 1
    if errors:
        print('\n'.join(errors), file=sys.stderr)
        return 1
    print('Collaboration delivery records OK')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

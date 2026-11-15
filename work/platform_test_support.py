"""Host-specific browser flags and memory checks, shared by serial tests."""
import ctypes
import os
import re
import subprocess
import sys
from pathlib import Path


def chromium_args(platform=None):
    platform = platform or sys.platform
    args = ['--no-proxy-server', '--enable-webgl', '--ignore-gpu-blocklist']
    if os.environ.get('CI'):
        args.extend(['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    elif platform == 'darwin':
        args.append('--use-angle=metal')
    elif platform == 'win32':
        args.append('--use-angle=d3d11')
    else:
        args.extend(['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    return args


def available_memory_mb():
    if sys.platform == 'win32':
        class MemoryStatus(ctypes.Structure):
            _fields_ = [('length', ctypes.c_ulong), ('load', ctypes.c_ulong)] + [
                (name, ctypes.c_ulonglong) for name in
                ('total_phys', 'avail_phys', 'total_page', 'avail_page', 'total_virtual', 'avail_virtual', 'extended')
            ]
        status = MemoryStatus()
        status.length = ctypes.sizeof(status)
        if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            raise OSError('GlobalMemoryStatusEx failed')
        return status.avail_phys / (1024 * 1024)
    if sys.platform == 'darwin':
        text = subprocess.check_output(['vm_stat'], text=True)
        page_size = int(re.search(r'page size of (\d+) bytes', text).group(1))
        pages = sum(int(m.group(1)) for label in
                    ('Pages free', 'Pages inactive', 'Pages speculative', 'Pages purgeable')
                    if (m := re.search(rf'{label}:\s+(\d+)\.', text)))
        return pages * page_size / (1024 * 1024)
    text = Path('/proc/meminfo').read_text()
    return int(re.search(r'MemAvailable:\s+(\d+)', text).group(1)) / 1024
